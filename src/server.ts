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
};

export async function searchSealed(q: string, set?: string): Promise<SealedItem[]> {
  const params = new URLSearchParams({ action: 'sealed', q });
  if (set) params.set('set', set);
  return (await call<{ items: SealedItem[] }>(`/api/prices?${params.toString()}`)).items ?? [];
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
