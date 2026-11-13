import { Card } from './types';

const BASE = 'https://api.pokemontcg.io/v2/cards';

const PRICE_KEYS = [
  'holofoil',
  'normal',
  'reverseHolofoil',
  '1stEditionHolofoil',
  '1stEditionNormal',
  'unlimitedHolofoil',
];

/** Stored TCGplayer market estimate (never rounded, never blended). */
export function marketPrice(card: Card): number | null {
  const prices = card.tcgplayer?.prices;
  if (!prices) return null;
  for (const k of PRICE_KEYS) {
    const m = prices[k]?.market;
    if (typeof m === 'number') return m;
  }
  return null;
}

export function formatMoney(n: number | null | undefined): string {
  return n == null ? '—' : `$${n.toFixed(2)}`;
}

export function formatDate(s?: string): string {
  if (!s) return 'no date';
  const d = new Date(s.replace(/\//g, '-'));
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function query(q: string, pageSize = 24, orderBy?: string): Promise<Card[]> {
  const url =
    `${BASE}?q=${encodeURIComponent(q)}&pageSize=${pageSize}` +
    (orderBy ? `&orderBy=${encodeURIComponent(orderBy)}` : '') +
    '&select=id,name,number,rarity,set,images,tcgplayer';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Catalog request failed (${res.status})`);
  const json = await res.json();
  return json.data as Card[];
}

export async function searchCards(text: string): Promise<Card[]> {
  const t = text.trim();
  if (!t) return [];
  const safe = t.replace(/"/g, '');
  const numeric = /^\d+$/.test(safe);
  const q = numeric
    ? `number:${safe}`
    : `name:"${safe}*" OR set.name:"${safe}*"`;
  return query(q, 24);
}

/** Cards with the highest stored raw market estimates. */
export async function topCards(era?: string, rarity?: string, size = 24): Promise<Card[]> {
  const parts = ['tcgplayer.prices.holofoil.market:[80 TO *]'];
  if (era) parts.push(`set.series:"${era}"`);
  if (rarity) parts.push(`rarity:"${rarity}"`);
  const cards = await query(parts.join(' '), 250);
  return cards
    .sort((a, b) => (marketPrice(b) ?? 0) - (marketPrice(a) ?? 0))
    .slice(0, size);
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
