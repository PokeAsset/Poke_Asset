/**
 * "Is it worth grading?" maths. Everything is shown to the user, nothing is hidden:
 * expected sale value if graded vs the value of selling the card raw.
 */

export type GradeOdds = { g10: number; g9: number; g8: number; g7: number; low: number };

export type GradePrices = {
  /** price of the raw card, null if unknown */
  raw: number | null;
  psa10: number | null;
  psa9: number | null;
  psa8: number | null;
  psa7: number | null;
};

export type WorthInputs = {
  prices: GradePrices;
  odds: GradeOdds;
  /** grading fee + shipping + insurance, in dollars */
  gradingCost: number;
  /** selling fee as a percent, e.g. 13 */
  sellFeePct: number;
};

export type WorthResult = {
  ok: boolean;
  reason?: string;
  rawNet: number;
  gradedNet: number;
  gain: number;
  gainPct: number | null;
  verdict: 'worth' | 'marginal' | 'not';
  rows: { label: string; odds: number; price: number; assumed: boolean }[];
  /** chance of PSA 10 needed for grading to break even, or null if it cannot */
  breakEven10: number | null;
};

/** Turns whatever the vision model returned into odds that add to 1. */
export function normalizeOdds(p?: Record<string, number>): GradeOdds | null {
  if (!p) return null;
  const v = (k: string) => (typeof p[k] === 'number' && p[k] > 0 ? p[k] : 0);
  const odds = { g10: v('10'), g9: v('9'), g8: v('8'), g7: v('7'), low: v('6OrLower') };
  const sum = odds.g10 + odds.g9 + odds.g8 + odds.g7 + odds.low;
  if (sum <= 0) return null;
  return {
    g10: odds.g10 / sum,
    g9: odds.g9 / sum,
    g8: odds.g8 / sum,
    g7: odds.g7 / sum,
    low: odds.low / sum,
  };
}

export function worthGrading(i: WorthInputs): WorthResult {
  const { prices, odds } = i;
  const empty: WorthResult = {
    ok: false,
    rawNet: 0,
    gradedNet: 0,
    gain: 0,
    gainPct: null,
    verdict: 'not',
    rows: [],
    breakEven10: null,
  };
  if (prices.raw == null) return { ...empty, reason: 'Pick the card (or type its raw price) so the raw value is known.' };
  if (prices.psa10 == null && prices.psa9 == null)
    return { ...empty, reason: 'No PSA 10 or PSA 9 price yet. Fetch graded prices or type them in.' };
  const keep = 1 - Math.max(0, Math.min(100, i.sellFeePct)) / 100;
  const raw = prices.raw;
  // A grade with no price is counted at the raw price (the card sells as raw at worst). Shown as "assumed".
  const row = (label: string, odd: number, price: number | null) => ({
    label,
    odds: odd,
    price: price ?? raw,
    assumed: price == null,
  });
  const rows = [
    row('PSA 10', odds.g10, prices.psa10),
    row('PSA 9', odds.g9, prices.psa9),
    row('PSA 8', odds.g8, prices.psa8),
    row('PSA 7', odds.g7, prices.psa7),
    { label: 'PSA 6 or lower', odds: odds.low, price: raw, assumed: true },
  ];
  const expected = rows.reduce((n, r) => n + r.odds * r.price, 0);
  const gradedNet = expected * keep - i.gradingCost;
  const rawNet = raw * keep;
  const gain = gradedNet - rawNet;
  const gainPct = rawNet > 0 ? (gain / rawNet) * 100 : null;
  const verdict: WorthResult['verdict'] =
    gain >= Math.max(5, rawNet * 0.1) ? 'worth' : gain > 0 ? 'marginal' : 'not';

  // chance of a 10 needed to break even, holding the rest of the odds' shape fixed
  let breakEven10: number | null = null;
  const p10 = prices.psa10 ?? raw;
  const restOdds = 1 - odds.g10;
  if (restOdds > 0 && p10 > 0) {
    const restExpected = restOdds > 0 ? (expected - odds.g10 * p10) / restOdds : raw;
    const need = rawNet + i.gradingCost; // gradedNet >= rawNet  <=>  expected*keep >= rawNet + cost
    const target = need / keep;
    if (p10 !== restExpected) {
      const p = (target - restExpected) / (p10 - restExpected);
      if (p >= 0 && p <= 1) breakEven10 = p;
    }
  }
  return { ok: true, rawNet, gradedNet, gain, gainPct, verdict, rows, breakEven10 };
}
