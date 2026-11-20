import { Platform } from 'react-native';
import { Card, GradedInfo, SeriesPoint } from './types';
import type { PhotoData } from './ui';

/**
 * Address of the PokéAsset server functions (the /api folder on Vercel).
 * In the browser the app calls its own site. In a native iOS build, set
 * EXPO_PUBLIC_API_BASE to your website address (for example https://pokeasset.com).
 */
const NATIVE_DEFAULT = 'https://pokeasset-nine.vercel.app';
const BASE =
  (process.env.EXPO_PUBLIC_API_BASE ?? (Platform.OS === 'web' ? '' : NATIVE_DEFAULT)).replace(/\/$/, '');

export class ServerError extends Error {
  notConfigured: boolean;
  constructor(message: string, notConfigured = false) {
    super(message);
    this.notConfigured = notConfigured;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new ServerError('Could not reach the PokéAsset server. Check your connection.');
  }
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // not JSON (for example the site returned a web page because the function is not deployed)
  }
  if (!res.ok || !json) {
    throw new ServerError(
      json?.error ??
        (res.status === 404
          ? 'The server functions are not deployed yet (the /api folder is missing on Vercel).'
          : `Server error (${res.status}).`),
      !!json?.notConfigured,
    );
  }
  return json as T;
}

const post = <T,>(path: string, body: unknown) =>
  call<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/* ---------------- Gemini: assistant ---------------- */

export async function askAssistant(messages: { role: string; text: string }[], context: string): Promise<string> {
  const r = await post<{ text: string; lookups?: string[] }>('/api/assistant', { messages, context });
  const text = r.text || 'I did not get an answer. Try asking again.';
  return r.lookups && r.lookups.length ? `${text}\n\nLive lookups used: ${r.lookups.join('; ')}` : text;
}

export type StreamHandlers = { onText: (delta: string) => void; onStatus?: (s: string) => void };

/**
 * Asks the assistant and shows the answer as it is written. Gives up after 75 seconds in total or 35 seconds
 * of silence. Where the platform cannot stream (some native builds) it falls back to one waiting request.
 */
export async function askAssistantStream(
  messages: { role: string; text: string }[],
  context: string,
  h: StreamHandlers,
  signal?: AbortSignal,
): Promise<string[]> {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  signal?.addEventListener('abort', onAbort);
  let silence: ReturnType<typeof setTimeout> | undefined;
  const bump = () => {
    if (silence) clearTimeout(silence);
    silence = setTimeout(() => ctl.abort(), 35000);
  };
  const overall = setTimeout(() => ctl.abort(), 75000);
  const tooSlow = () => new ServerError('The assistant took too long to answer. Try again, or ask a shorter question.');
  try {
    bump();
    let res: Response;
    try {
      res = await fetch(`${BASE}/api/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, context, stream: true }),
        signal: ctl.signal,
      });
    } catch {
      if (signal?.aborted) throw new ServerError('Stopped.');
      throw ctl.signal.aborted ? tooSlow() : new ServerError('Could not reach the PokéAsset server. Check your connection.');
    }
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.includes('ndjson')) {
      let j: any = null;
      try {
        j = await res.json();
      } catch {
        // not JSON
      }
      if (res.ok && j?.text) {
        h.onText(j.text);
        return j.lookups ?? [];
      }
      throw new ServerError(
        j?.error ?? (res.status === 404 ? 'The server functions are not deployed yet (the /api folder is missing on Vercel).' : res.status === 504 ? 'The server took too long to answer. Try again.' : `Server error (${res.status}).`),
        !!j?.notConfigured,
      );
    }
    const reader = (res as any).body?.getReader?.();
    if (!reader) {
      // no streaming here: use the one-shot endpoint
      const text = await askAssistant(messages, context);
      h.onText(text);
      return [];
    }
    const dec = new TextDecoder();
    let buf = '';
    let lookups: string[] = [];
    let got = false;
    const handle = (line: string) => {
      if (!line.trim()) return;
      let ev: any;
      try {
        ev = JSON.parse(line);
      } catch {
        return;
      }
      if (ev.t === 'text') {
        got = true;
        h.onStatus?.('');
        h.onText(ev.v);
      } else if (ev.t === 'status') h.onStatus?.(ev.v);
      else if (ev.t === 'done') lookups = ev.lookups ?? [];
      else if (ev.t === 'error') throw new ServerError(ev.v || 'The assistant had a problem.', !!ev.notConfigured);
    };
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bump();
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf('\n')) >= 0) {
          handle(buf.slice(0, i));
          buf = buf.slice(i + 1);
        }
      }
      handle(buf);
    } catch (e) {
      if (e instanceof ServerError) throw e;
      if (signal?.aborted) throw new ServerError('Stopped.');
      throw tooSlow();
    }
    if (!got) throw new ServerError('The assistant returned nothing. Try again.');
    return lookups;
  } finally {
    clearTimeout(overall);
    if (silence) clearTimeout(silence);
    signal?.removeEventListener('abort', onAbort);
  }
}

export type TestResult = { ok: boolean; ms: number; message: string };
export type Diagnostics = KeyStatus & { tests: { gemini: TestResult; prices: TestResult; catalog: TestResult; accounts: TestResult } };

export type ModelTime = { model: string; ok: boolean; ms: number; message: string };
export type ModelCompare = { current?: string; models: ModelTime[]; error?: string };

/** Times a tiny request on each Gemini model this key can use. */
export async function compareModels(): Promise<ModelCompare> {
  return call<ModelCompare>('/api/status?test=models');
}

/** Makes one small live call to each service and reports what each one said (no keys are returned). */
export async function runDiagnostics(): Promise<Diagnostics> {
  return call<Diagnostics>('/api/status?test=1');
}

export type KeyStatus = { gemini: boolean; prices: boolean; accounts?: boolean; model: string };

/** Which server keys are connected (true/false only, never the keys themselves). */
export async function getStatus(): Promise<KeyStatus> {
  return call<KeyStatus>('/api/status');
}

/* ---------------- Gemini: vision ---------------- */

const img = (p: PhotoData) => ({ mime: p.mime, data: p.base64 });

export type CardGuess = {
  name: string | null;
  setName?: string | null;
  number?: string | null;
  printedTotal?: string | null;
  rarity?: string | null;
  confidence?: number;
  notes?: string;
};
export async function identifyCard(photo: PhotoData): Promise<CardGuess> {
  return (await post<{ result: CardGuess }>('/api/vision', { task: 'card', images: [img(photo)] })).result;
}

export type SealedGuess = {
  productName: string | null;
  setName?: string | null;
  productType?: string | null;
  language?: string | null;
  confidence?: number;
  notes?: string;
};
export async function identifySealed(photo: PhotoData): Promise<SealedGuess> {
  return (await post<{ result: SealedGuess }>('/api/vision', { task: 'sealed', images: [img(photo)] })).result;
}

export type GradeRead = {
  centering?: { front?: string; back?: string | null; note?: string };
  corners?: { score?: number; note?: string };
  edges?: { score?: number; note?: string };
  surface?: { score?: number; note?: string };
  psaProbabilities?: Record<string, number>;
  psaLow?: number;
  psaHigh?: number;
  confidence?: number;
  cannotJudge?: string[];
  summary?: string;
};
export async function gradePhotos(photos: PhotoData[]): Promise<GradeRead> {
  return (await post<{ result: GradeRead }>('/api/vision', { task: 'grade', images: photos.map(img) })).result;
}

/* ---------------- price service: graded prices, history, sealed ---------------- */

type RawPriceCard = {
  name: string;
  setName: string | null;
  number: string | null;
  tcgPlayerId: string | number | null;
  market: number | null;
  graded: Record<string, { price: number; sales: number | null }>;
  history: { raw: SeriesPoint[] | null; graded: Record<string, SeriesPoint[]> };
  updatedAt: string | null;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const firstNumber = (s: string | null | undefined) => (s ?? '').split('/')[0].replace(/^0+/, '').toLowerCase();

/** Picks the service's record that is the same card as ours (name + collector number + set). */
export function pickSameCard(card: Card, list: RawPriceCard[]): RawPriceCard | null {
  const wantNum = firstNumber(card.number);
  const scored = list
    .map((c) => {
      let score = 0;
      if (norm(c.name ?? '').includes(norm(card.name))) score += 2;
      if (wantNum && firstNumber(c.number) === wantNum) score += 3;
      if (c.setName && norm(c.setName) === norm(card.set.name)) score += 3;
      return { c, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored.length && scored[0].score >= 5 ? scored[0].c : null;
}

/** Graded prices and price history for one card. Returns null when the service has no match. */
export async function fetchGraded(card: Card): Promise<GradedInfo | null> {
  const params = new URLSearchParams({
    action: 'card',
    name: card.name,
    number: firstNumber(card.number),
    set: card.set.name,
  });
  const r = await call<{ cards: RawPriceCard[] }>(`/api/prices?${params.toString()}`);
  const match = pickSameCard(card, r.cards ?? []);
  if (!match) return null;
  return {
    fetchedAt: new Date().toISOString(),
    values: match.graded ?? {},
    rawHistory: match.history?.raw ?? null,
    gradedHistory: match.history?.graded ?? {},
    tcgPlayerId: match.tcgPlayerId,
  };
}

export type SealedItem = {
  id: string | number | null;
  name: string;
  setName: string | null;
  type: string | null;
  market: number | null;
  low: number | null;
  updatedAt: string | null;
  history: SeriesPoint[] | null;
  /** edition / printing words found in the name, e.g. "1st Edition" */
  variant?: string | null;
  /** where the price came from, shown next to it */
  source?: string | null;
};

export type SealedResult = { items: SealedItem[]; fetchedAt: string; warnings: string[] };

const sealedCache = new Map<string, { at: number; r: SealedResult }>();
const SEALED_TTL = 6 * 60 * 60 * 1000;

/**
 * Sealed products and their prices. Results are reused for 6 hours (prices from the service only change about
 * daily); pass force = true (the Refresh button) to ask again now.
 */
export async function loadSealed(q: string, set?: string, force = false): Promise<SealedResult> {
  const key = `${q}|${set ?? ''}`;
  const hit = sealedCache.get(key);
  if (!force && hit && Date.now() - hit.at < SEALED_TTL) return hit.r;
  const params = new URLSearchParams({ action: 'sealed', q });
  if (set) params.set('set', set);
  const r = await call<{ items: SealedItem[]; errors?: { provider: string; message: string }[]; fetchedAt?: string }>(`/api/prices?${params.toString()}`);
  const out: SealedResult = {
    items: (r.items ?? []).filter((p) => p && typeof p.name === 'string'),
    fetchedAt: r.fetchedAt ?? new Date().toISOString(),
    warnings: (r.errors ?? []).map((e) => `${e.provider}: ${e.message}`),
  };
  sealedCache.set(key, { at: Date.now(), r: out });
  return out;
}

export async function searchSealed(q: string, set?: string): Promise<SealedItem[]> {
  return (await loadSealed(q, set)).items;
}

/* ---------------- accounts ---------------- */

export type AuthConfig = { enabled: boolean; url?: string; anonKey?: string };

/** Whether accounts are set up on the server (Supabase address + public key). */
export async function getAuthConfig(): Promise<AuthConfig> {
  return call<AuthConfig>('/api/config');
}

/** TCGplayer search page for a product, so you can check its price there. */
export const tcgplayerUrl = (name: string) =>
  `https://www.tcgplayer.com/search/pokemon/product?productLineName=pokemon&view=grid&q=${encodeURIComponent(name)}`;
