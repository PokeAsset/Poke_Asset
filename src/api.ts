import { Platform } from 'react-native';
import { Card } from './types';

const DIRECT = 'https://api.pokemontcg.io/v2';
const SITE = (process.env.EXPO_PUBLIC_API_BASE ?? (Platform.OS === 'web' ? '' : 'https://pokeasset-nine.vercel.app')).replace(/\/$/, '');

async function fetchTimeout(url: string, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Reads the card catalog. Goes through the site's own /api/catalog first (it has a timeout, a retry and caching),
 * then falls back to pokemontcg.io directly. Failures come back as plain sentences, not "Load failed".
 */
async function catalog(kind: 'cards' | 'sets', params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  let reason = '';
  try {
    const r = await fetchTimeout(`${SITE}/api/catalog?kind=${kind}&${qs}`, 30000);
    if (r.ok) {
      const j = await r.json().catch(() => null);
      if (j && Array.isArray(j.data)) return j;
    }
    reason = `site catalog ${r.status}`;
  } catch {
    reason = 'site catalog unreachable';
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetchTimeout(`${DIRECT}/${kind}?${qs}`, 25000);
      if (r.ok) return await r.json();
      reason = `catalog ${r.status}`;
      if (r.status < 500 && r.status !== 429) break;
    } catch {
      reason = 'catalog timed out';
    }
  }
  throw new Error(`The card catalog is not answering right now (${reason}). Check your connection and try again in a moment.`);
}

const PRICE_KEYS = [
  'holofoil',
  'normal',
  'reverseHolofoil',
  '1stEditionHolofoil',
  '1stEditionNormal',
  'unlimitedHolofoil',
];

export const VARIANT_LABELS: Record<string, string> = {
  unlimitedNormal: 'Unlimited normal',
  holofoil: 'Holofoil',
  normal: 'Normal',
  reverseHolofoil: 'Reverse holofoil',
  '1stEditionHolofoil': '1st edition holofoil',
  '1stEditionNormal': '1st edition normal',
  unlimitedHolofoil: 'Unlimited holofoil',
};

export type PriceDetail = {
  market: number | null;
  low: number | null;
  high: number | null;
  variant: string | null;
  updatedAt?: string;
};

export type VariantPrice = { key: string; label: string; market: number | null; low: number | null; high: number | null };

const prettyKey = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

/** Every printing of a card that has a stored price (Normal, Holofoil, Reverse holofoil, 1st edition...). */
export function variantList(card: Card): VariantPrice[] {
  const prices = card.tcgplayer?.prices ?? {};
  return Object.keys(prices).map((k) => {
    const p = prices[k];
    return {
      key: k,
      label: VARIANT_LABELS[k] ?? prettyKey(k),
      market: typeof p.market === 'number' ? p.market : null,
      low: typeof p.low === 'number' ? p.low : null,
      high: typeof p.high === 'number' ? p.high : null,
    };
  });
}

/** Stored TCGplayer reading for a card (never rounded, never blended). Pass a variant key to read one printing. */
export function priceDetail(card: Card, variant?: string): PriceDetail {
  const prices = card.tcgplayer?.prices;
  const updatedAt = card.tcgplayer?.updatedAt;
  if (prices && variant && prices[variant] && typeof prices[variant].market === 'number') {
    const p = prices[variant];
    return {
      market: p.market as number,
      low: typeof p.low === 'number' ? p.low : null,
      high: typeof p.high === 'number' ? p.high : null,
      variant: VARIANT_LABELS[variant] ?? prettyKey(variant),
      updatedAt,
    };
  }
  if (prices) {
    for (const k of PRICE_KEYS) {
      const p = prices[k];
      if (p && typeof p.market === 'number') {
        return {
          market: p.market,
          low: typeof p.low === 'number' ? p.low : null,
          high: typeof p.high === 'number' ? p.high : null,
          variant: VARIANT_LABELS[k] ?? k,
          updatedAt,
        };
      }
    }
  }
  return { market: null, low: null, high: null, variant: null, updatedAt };
}

export function marketPrice(card: Card, variant?: string): number | null {
  return priceDetail(card, variant).market;
}

export function formatMoney(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  return `$${n.toFixed(2)}`;
}

export function formatSigned(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(2)}`;
}

export function formatPct(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

export function formatDate(s?: string | null): string {
  if (!s) return 'no date';
  const d = new Date(s.replace(/\//g, '-'));
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function query(q: string, pageSize = 24, orderBy?: string): Promise<Card[]> {
  const params: Record<string, string> = { q, pageSize: String(pageSize), select: 'id,name,number,rarity,set,images,tcgplayer' };
  if (orderBy) params.orderBy = orderBy;
  const json = await catalog('cards', params);
  return json.data as Card[];
}

export async function searchCards(text: string): Promise<Card[]> {
  const t = text.trim();
  if (!t) return [];
  const safe = t.replace(/"/g, '');
  const numeric = /^\d+$/.test(safe);
  const q = numeric ? `number:${safe}` : `name:"${safe}*" OR set.name:"${safe}*"`;
  return query(q, 24);
}

/** Fetch the latest copy of specific cards by their catalog ids. */
export async function fetchCardsByIds(ids: string[]): Promise<Card[]> {
  const unique = Array.from(new Set(ids));
  const out: Card[] = [];
  for (let i = 0; i < unique.length; i += 20) {
    const chunk = unique.slice(i, i + 20);
    const q = chunk.map((id) => `id:"${id}"`).join(' OR ');
    const part = await query(q, 250);
    out.push(...part);
  }
  return out;
}

export type RankedCard = { card: Card; price: number; variant: string; updatedAt: string | null };

/**
 * Cards ranked by raw TCGplayer market estimate (via pokemontcg.io). Cards without a verified market price are
 * left out. Looks at every printing (holofoil, normal, reverse holo, 1st edition), not only holofoil.
 */
export async function rankedCards(seriesList?: string[], rarity?: string, size = 60): Promise<RankedCard[]> {
  const price = PRICE_KEYS.map((k) => `tcgplayer.prices.${k}.market:[40 TO *]`).join(' OR ');
  const parts = [`(${price})`];
  if (seriesList && seriesList.length) parts.push(`(${seriesList.map((x) => `set.series:"${x}"`).join(' OR ')})`);
  if (rarity) parts.push(`rarity:"${rarity}"`);
  const cards = await query(parts.join(' '), 250);
  const out: RankedCard[] = [];
  cards.forEach((c) => {
    const best = variantList(c)
      .filter((v) => v.market != null && v.market > 0)
      .sort((a, b) => (b.market ?? 0) - (a.market ?? 0))[0];
    if (best && best.market != null) out.push({ card: c, price: best.market, variant: best.label, updatedAt: c.tcgplayer?.updatedAt ?? null });
  });
  return out.sort((a, b) => b.price - a.price).slice(0, size);
}

/** Cards with the highest stored raw market estimates. */
export async function topCards(era?: string, rarity?: string, size = 24): Promise<Card[]> {
  return (await rankedCards(era ? [era] : undefined, rarity, size)).map((r) => r.card);
}

const SEED: { name: string; number: string }[] = [
  { name: 'Latias & Latios-GX', number: '170' },
  { name: 'Umbreon VMAX', number: '215' },
  { name: 'Gengar & Mimikyu-GX', number: '165' },
  { name: 'Lucky Stadium', number: '' },
  { name: 'Lugia-EX', number: '' },
  { name: 'Rayquaza VMAX', number: '218' },
];

/** Home screen "Most valuable in the catalog" grid. */
export async function featuredCards(): Promise<Card[]> {
  const out = await Promise.all(
    SEED.map(async (s) => {
      const q = s.number ? `name:"${s.name}" number:${s.number}` : `name:"${s.name}"`;
      const r = await query(q, 20).catch(() => [] as Card[]);
      return r.sort((a, b) => (marketPrice(b) ?? 0) - (marketPrice(a) ?? 0))[0];
    }),
  );
  return out.filter(Boolean) as Card[];
}

/** Finds catalog cards for a name read from a photo, best match first. */
export async function matchCards(name: string, number?: string | null, setName?: string | null): Promise<Card[]> {
  const n = name.replace(/"/g, '').trim();
  if (!n) return [];
  const num = (number ?? '').split('/')[0].replace(/^0+/, '').replace(/[^A-Za-z0-9]/g, '');
  const tries: string[] = [];
  if (num) tries.push(`name:"${n}" number:"${num}"`);
  tries.push(`name:"${n}*"`);
  for (const q of tries) {
    const found = await query(q, 30).catch(() => [] as Card[]);
    if (found.length) {
      const want = (setName ?? '').toLowerCase();
      return found.sort((a, b) => {
        const score = (c: Card) =>
          (num && c.number.toLowerCase() === num.toLowerCase() ? 2 : 0) +
          (want && c.set.name.toLowerCase().includes(want) ? 2 : 0);
        return score(b) - score(a);
      });
    }
  }
  return [];
}

export type SetInfo = {
  id: string;
  name: string;
  ptcgoCode?: string;
  series: string;
  printedTotal: number;
  total: number;
  releaseDate: string;
  images?: { symbol?: string; logo?: string };
};

/** Every set the catalog has ever released, newest first. */
export async function fetchSets(): Promise<SetInfo[]> {
  const json = await catalog('sets', {
    orderBy: '-releaseDate',
    pageSize: '250',
    select: 'id,name,ptcgoCode,series,printedTotal,total,releaseDate,images',
  });
  return json.data as SetInfo[];
}

/** All cards in one set, every page. */
export async function fetchSetCards(setId: string): Promise<Card[]> {
  const out: Card[] = [];
  for (let page = 1; page <= 8; page++) {
    const json = await catalog('cards', {
      q: `set.id:"${setId}"`,
      pageSize: '250',
      page: String(page),
      select: 'id,name,number,rarity,set,images,tcgplayer',
    });
    out.push(...(json.data as Card[]));
    if ((json.data as Card[]).length < 250) break;
  }
  const n = (c: Card) => parseInt(c.number, 10);
  return out.sort((a, b) => (isNaN(n(a)) || isNaN(n(b)) ? a.number.localeCompare(b.number) : n(a) - n(b)));
}

export type SetArt = { small: string; large: string; price: number };

const artCache = new Map<string, Promise<Record<string, SetArt>>>();
let artChain: Promise<unknown> = Promise.resolve();

/**
 * One representative card image per set (the most valuable card with a price), used as the set's picture.
 * One era per call, calls are queued one after another so the catalog is not flooded.
 */
export function fetchEraArt(series: string[]): Promise<Record<string, SetArt>> {
  const key = series.join('|');
  const cached = artCache.get(key);
  if (cached) return cached;
  const job = artChain.then(async () => {
    const s = series.map((x) => `set.series:"${x}"`).join(' OR ');
    const price = ['holofoil', 'normal', 'reverseHolofoil', '1stEditionHolofoil']
      .map((k) => `tcgplayer.prices.${k}.market:[15 TO *]`)
      .join(' OR ');
    const out: Record<string, SetArt> = {};
    for (let page = 1; page <= 3; page++) {
      const json = await catalog('cards', { q: `(${s}) (${price})`, pageSize: '250', page: String(page), select: 'id,images,set,tcgplayer' });
      const data = (json.data ?? []) as Card[];
      data.forEach((c) => {
        const p = marketPrice(c) ?? 0;
        const have = out[c.set.id];
        if (!have || p > have.price) out[c.set.id] = { small: c.images.small, large: c.images.large, price: p };
      });
      if (data.length < 250) break;
    }
    return out;
  });
  artChain = job.catch(() => undefined);
  const result = job.catch(() => {
    artCache.delete(key);
    return {} as Record<string, SetArt>;
  });
  artCache.set(key, result);
  return result;
}

/** Opens the card on TCGplayer (their own page, so the live price can be checked there). */
export const cardTcgplayerUrl = (card: Card): string =>
  card.tcgplayer?.url ||
  `https://www.tcgplayer.com/search/pokemon/product?productLineName=pokemon&view=grid&q=${encodeURIComponent(`${card.name} ${(card.number ?? '').split('/')[0]}`.trim())}`;
