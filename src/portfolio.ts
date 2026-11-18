import { marketPrice } from './api';
import { OwnedEntry, SaleEntry, SealedEntry, Snapshot } from './types';
import { formatDate, formatMoney, formatPct, formatSigned } from './api';

export type ValueBasis = 'declared' | 'market' | 'none';

/** Value of ONE copy: your own declared value wins, else the stored market estimate. */
export function entryValue(e: OwnedEntry): { perCopy: number | null; basis: ValueBasis } {
  if (typeof e.declaredValue === 'number' && e.declaredValue >= 0) {
    return { perCopy: e.declaredValue, basis: 'declared' };
  }
  const m = marketPrice(e.card, e.variant);
  if (m != null) return { perCopy: m, basis: 'market' };
  return { perCopy: null, basis: 'none' };
}

export function entryPnl(e: OwnedEntry): { pnl: number | null; pct: number | null } {
  const v = entryValue(e);
  if (v.perCopy == null) return { pnl: null, pct: null };
  const cost = e.cost * e.qty;
  const pnl = v.perCopy * e.qty - cost;
  return { pnl, pct: cost > 0 ? (pnl / cost) * 100 : null };
}

export type Totals = {
  copies: number;
  graded: number;
  value: number;
  cost: number;
  pricedCost: number;
  pnl: number;
  pnlPct: number | null;
  unpriced: number;
};

/**
 * Profit/loss only compares value against the cost of copies that HAVE a price,
 * so a card with no price never shows up as a fake loss.
 */
export function portfolioTotals(owned: OwnedEntry[]): Totals {
  let copies = 0;
  let graded = 0;
  let value = 0;
  let cost = 0;
  let pricedCost = 0;
  let unpriced = 0;
  for (const e of owned) {
    copies += e.qty;
    if (e.graded) graded += e.qty;
    cost += e.cost * e.qty;
    const v = entryValue(e);
    if (v.perCopy == null) {
      unpriced += e.qty;
    } else {
      value += v.perCopy * e.qty;
      pricedCost += e.cost * e.qty;
    }
  }
  const pnl = value - pricedCost;
  return {
    copies,
    graded,
    value,
    cost,
    pricedCost,
    pnl,
    pnlPct: pricedCost > 0 ? (pnl / pricedCost) * 100 : null,
    unpriced,
  };
}

export type SetProgress = {
  setId: string;
  name: string;
  series?: string;
  owned: number;
  total: number | null;
};

/** Distinct cards owned per set, against the set's total card count. */
export function setProgress(owned: OwnedEntry[]): SetProgress[] {
  const map = new Map<string, { name: string; series?: string; total: number | null; ids: Set<string> }>();
  for (const e of owned) {
    const s = e.card.set;
    let row = map.get(s.id);
    if (!row) {
      row = { name: s.name, series: s.series, total: s.total ?? s.printedTotal ?? null, ids: new Set<string>() };
      map.set(s.id, row);
    }
    row.ids.add(e.card.id);
  }
  const list: SetProgress[] = [];
  map.forEach((row, setId) => {
    list.push({ setId, name: row.name, series: row.series, owned: row.ids.size, total: row.total });
  });
  list.sort((a, b) => {
    const pa = a.total ? a.owned / a.total : 0;
    const pb = b.total ? b.owned / b.total : 0;
    return pb - pa || a.name.localeCompare(b.name);
  });
  return list;
}

/** Local date as YYYY-MM-DD. */
export function todayKey(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** One snapshot per day; a newer reading on the same day replaces the older one. */
export function upsertSnapshot(prev: Snapshot[], next: Snapshot): Snapshot[] {
  const rest = prev.filter((s) => s.date !== next.date);
  return [...rest, next].sort((a, b) => a.date.localeCompare(b.date)).slice(-365);
}

/* ---------------- sealed products, sales, and the combined portfolio ---------------- */

export type SealedTotals = { items: number; value: number; cost: number; pricedCost: number; unpriced: number };

export function sealedTotals(sealed: SealedEntry[]): SealedTotals {
  const t: SealedTotals = { items: 0, value: 0, cost: 0, pricedCost: 0, unpriced: 0 };
  for (const s of sealed) {
    t.items += s.qty;
    t.cost += s.cost * s.qty;
    if (s.market == null) {
      t.unpriced += s.qty;
    } else {
      t.value += s.market * s.qty;
      t.pricedCost += s.cost * s.qty;
    }
  }
  return t;
}

export type Combined = {
  value: number;
  cost: number;
  pricedCost: number;
  pnl: number;
  pnlPct: number | null;
  unpriced: number;
  singles: Totals;
  sealed: SealedTotals;
};

/** Singles and sealed together. Profit only compares priced items against their own cost. */
export function combinedTotals(owned: OwnedEntry[], sealed: SealedEntry[]): Combined {
  const singles = portfolioTotals(owned);
  const sl = sealedTotals(sealed);
  const value = singles.value + sl.value;
  const pricedCost = singles.pricedCost + sl.pricedCost;
  const pnl = value - pricedCost;
  return {
    value,
    cost: singles.cost + sl.cost,
    pricedCost,
    pnl,
    pnlPct: pricedCost > 0 ? (pnl / pricedCost) * 100 : null,
    unpriced: singles.unpriced + sl.unpriced,
    singles,
    sealed: sl,
  };
}

export function realizedProfit(sales: SaleEntry[]): number {
  return sales.reduce((n, s) => n + (s.price - s.cost) * s.qty, 0);
}

/**
 * Plain-text snapshot of the portfolio for the AI assistant: value, cost basis, top gainers and losers,
 * sealed vs singles, recent sales. Only stored numbers, each with its date, so the assistant can cite them.
 */
export function assistantContext(
  owned: OwnedEntry[],
  sealed: SealedEntry[],
  sales: SaleEntry[],
  recent: string[],
  extra: string[] = [],
): string {
  const c = combinedTotals(owned, sealed);
  const L: string[] = [];
  L.push(
    `TOTAL: value ${formatMoney(c.value)}, cost basis ${formatMoney(c.cost)}, unrealized P/L ` +
      `${c.pricedCost > 0 ? `${formatSigned(c.pnl)} (${formatPct(c.pnlPct)})` : 'unknown'}` +
      `${c.unpriced ? `; ${c.unpriced} items have no price and are excluded from P/L` : ''}.`,
  );
  const share = c.value > 0 ? (c.sealed.value / c.value) * 100 : 0;
  L.push(
    `SPLIT: singles ${c.singles.copies} copies worth ${formatMoney(c.singles.value)} (${c.singles.graded} graded); ` +
      `sealed ${c.sealed.items} items worth ${formatMoney(c.sealed.value)} (${share.toFixed(0)}% of value).`,
  );
  const ranked = owned
    .map((e) => ({ e, p: entryPnl(e) }))
    .filter((x) => x.p.pnl != null)
    .sort((a, b) => (b.p.pnl as number) - (a.p.pnl as number));
  const line = (x: (typeof ranked)[number]) =>
    `${x.e.qty} x ${x.e.card.name} (${x.e.card.set.name} #${x.e.card.number}${x.e.graded ? `, ${x.e.company ?? ''} ${x.e.grade ?? ''}` : ''}): ` +
    `${formatSigned(x.p.pnl)}${x.p.pct != null ? ` (${formatPct(x.p.pct)})` : ''}` +
    `${x.e.card.tcgplayer?.updatedAt ? `, price dated ${formatDate(x.e.card.tcgplayer.updatedAt)}` : ''}`;
  if (ranked.length) {
    L.push('TOP GAINERS:\n' + ranked.slice(0, 5).map((x) => '- ' + line(x)).join('\n'));
    const losers = ranked.filter((x) => (x.p.pnl as number) < 0).slice(-3).reverse();
    if (losers.length) L.push('BIGGEST LOSERS:\n' + losers.map((x) => '- ' + line(x)).join('\n'));
  }
  if (sealed.length) {
    L.push(
      'SEALED:\n' +
        sealed
          .slice(0, 15)
          .map(
            (s) =>
              `- ${s.qty} x ${s.name}${s.setName ? ` (${s.setName})` : ''}: paid ${formatMoney(s.cost)} each, ` +
              `market ${formatMoney(s.market)}${s.updatedAt ? ` dated ${formatDate(s.updatedAt)}` : ''}`,
          )
          .join('\n'),
    );
  }
  if (sales.length) {
    L.push(
      `REALIZED PROFIT from ${sales.length} recorded sales: ${formatSigned(realizedProfit(sales))}.\nRECENT SALES:\n` +
        sales
          .slice(0, 8)
          .map((s) => `- ${s.date}: sold ${s.qty} x ${s.name} at ${formatMoney(s.price)} each (cost ${formatMoney(s.cost)})`)
          .join('\n'),
    );
  } else {
    L.push('RECENT SALES: none recorded.');
  }
  if (recent.length) L.push('RECENT ACTIVITY:\n' + recent.slice(0, 8).map((r) => `- ${r}`).join('\n'));
  L.push(...extra);
  return L.join('\n');
}
