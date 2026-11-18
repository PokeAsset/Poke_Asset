/**
 * Marketplace data layer: talks to the Supabase tables created by supabase/marketplace.sql.
 * Every permission (who can see, edit, remove, or administer) is enforced by the database, not by this file.
 */

export type Rest = (path: string, init?: RequestInit, anon?: boolean) => Promise<Response>;

export type ListingStatus = 'available' | 'reserved' | 'sold' | 'removed';
export type MarketListing = {
  id: string;
  seller_id: string;
  seller_name: string;
  kind: 'card' | 'sealed';
  title: string;
  description: string;
  set_name: string | null;
  grade: string | null;
  condition: string | null;
  qty: number;
  price: number;
  market_price: number | null;
  market_source: string | null;
  image_url: string | null;
  photo_urls: string[];
  external_url: string | null;
  status: ListingStatus;
  admin_removed: boolean;
  removed_reason: string | null;
  created_at: string;
  updated_at: string;
};
export type NewListing = Pick<MarketListing, 'kind' | 'title' | 'description' | 'qty' | 'price'> &
  Partial<Pick<MarketListing, 'seller_name' | 'set_name' | 'grade' | 'condition' | 'market_price' | 'market_source' | 'image_url' | 'photo_urls' | 'external_url'>>;

export type OrderStatus = 'requested' | 'accepted' | 'declined' | 'shipped' | 'completed' | 'cancelled';
export type MarketOrder = {
  id: string;
  source: 'pokeasset' | 'external';
  listing_id: string | null;
  buyer_id: string;
  seller_id: string | null;
  seller_name: string | null;
  title: string;
  price: number;
  qty: number;
  status: OrderStatus;
  platform: string | null;
  external_url: string | null;
  note: string;
  payment: string;
  created_at: string;
  updated_at: string;
};
export type MarketReport = {
  id: string;
  listing_id: string;
  reporter_id: string;
  reason: string;
  status: 'open' | 'dismissed' | 'actioned';
  created_at: string;
};
export type HistoryEvent = { id: number; actor_id: string | null; event: string; detail: string | null; created_at: string; listing_id?: string; order_id?: string };

async function failure(res: Response): Promise<Error> {
  let j: any = null;
  try {
    j = await res.json();
  } catch {
    // no body
  }
  const m = String(j?.message || j?.msg || j?.error || '');
  if (/could not find the table|relation .* does not exist|schema cache/i.test(m)) {
    return new Error('The marketplace tables are missing. Run supabase/marketplace.sql in your Supabase SQL Editor.');
  }
  if (/jwt|token/i.test(m) && /expired|invalid/i.test(m)) return new Error('Your sign-in expired. Sign in again.');
  if (res.status === 401) return new Error('Sign in to do that.');
  if (res.status === 403 || /row-level security|permission denied/i.test(m)) return new Error('You are not allowed to do that.');
  if (/violates check constraint/i.test(m)) return new Error('One of the values is not allowed (check the price, quantity and text lengths).');
  return new Error(m || `Request failed (${res.status}).`);
}

async function read<T>(res: Response): Promise<T> {
  if (!res.ok) throw await failure(res);
  return (await res.json()) as T;
}

const clean = (s: string) => s.replace(/[,()*%\\]/g, ' ').trim();

export type ListingQuery = {
  q?: string;
  kind?: 'card' | 'sealed' | '';
  min?: number;
  max?: number;
  sort?: 'new' | 'low' | 'high';
  status?: ListingStatus[];
  seller?: string;
  id?: string;
  limit?: number;
};

export async function listListings(rest: Rest, o: ListingQuery = {}): Promise<MarketListing[]> {
  const p = new URLSearchParams();
  p.set('select', '*');
  p.set('status', `in.(${(o.status ?? ['available', 'reserved']).join(',')})`);
  if (o.kind) p.set('kind', `eq.${o.kind}`);
  if (o.seller) p.set('seller_id', `eq.${o.seller}`);
  if (o.id) p.set('id', `eq.${o.id}`);
  const q = clean(o.q ?? '');
  if (q) p.set('or', `(title.ilike.*${q}*,set_name.ilike.*${q}*,seller_name.ilike.*${q}*)`);
  const and: string[] = [];
  if (o.min != null && o.min > 0) and.push(`price.gte.${o.min}`);
  if (o.max != null && o.max > 0) and.push(`price.lte.${o.max}`);
  if (and.length) p.set('and', `(${and.join(',')})`);
  p.set('order', o.sort === 'low' ? 'price.asc' : o.sort === 'high' ? 'price.desc' : 'created_at.desc');
  p.set('limit', String(o.limit ?? 200));
  return read<MarketListing[]>(await rest(`listings?${p.toString()}`, {}, true));
}

export async function createListing(rest: Rest, userId: string, l: NewListing): Promise<MarketListing> {
  const res = await rest('listings', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...l, seller_id: userId, status: 'available' }),
  });
  return (await read<MarketListing[]>(res))[0];
}

export async function updateListing(rest: Rest, id: string, patch: Partial<MarketListing>): Promise<MarketListing> {
  const res = await rest(`listings?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
  const rows = await read<MarketListing[]>(res);
  if (!rows[0]) throw new Error('That listing could not be changed (it may have been removed by a moderator).');
  return rows[0];
}

export async function listingHistory(rest: Rest, id: string): Promise<HistoryEvent[]> {
  return read<HistoryEvent[]>(await rest(`listing_events?listing_id=eq.${id}&select=*&order=created_at.desc&limit=50`));
}

export async function createReport(rest: Rest, userId: string, listingId: string, reason: string): Promise<void> {
  const res = await rest('reports', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ listing_id: listingId, reporter_id: userId, reason }) });
  if (res.status === 409 || /duplicate key/i.test(await res.clone().text())) throw new Error('You already reported this listing.');
  if (!res.ok) throw await failure(res);
}

/* ---------- orders ---------- */

export async function requestToBuy(rest: Rest, userId: string, listingId: string, qty: number, note: string): Promise<MarketOrder> {
  const res = await rest('orders', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    // title, price and seller are filled in by the database from the listing, so they cannot be faked
    body: JSON.stringify({ source: 'pokeasset', listing_id: listingId, buyer_id: userId, title: 'order', price: 0, qty, note }),
  });
  return (await read<MarketOrder[]>(res))[0];
}

export async function logExternalOrder(
  rest: Rest,
  userId: string,
  o: { title: string; price: number; qty: number; platform: string; external_url?: string; note?: string; status?: OrderStatus },
): Promise<MarketOrder> {
  const res = await rest('orders', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ source: 'external', buyer_id: userId, status: o.status ?? 'completed', ...o }),
  });
  return (await read<MarketOrder[]>(res))[0];
}

export async function listOrders(rest: Rest, userId: string, role: 'buyer' | 'seller'): Promise<MarketOrder[]> {
  const col = role === 'buyer' ? 'buyer_id' : 'seller_id';
  return read<MarketOrder[]>(await rest(`orders?${col}=eq.${userId}&select=*&order=created_at.desc&limit=200`));
}

export async function updateOrder(rest: Rest, id: string, patch: Partial<Pick<MarketOrder, 'status' | 'note'>>): Promise<MarketOrder> {
  const res = await rest(`orders?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
  const rows = await read<MarketOrder[]>(res);
  if (!rows[0]) throw new Error('That order could not be changed.');
  return rows[0];
}

export async function orderHistory(rest: Rest, id: string): Promise<HistoryEvent[]> {
  return read<HistoryEvent[]>(await rest(`order_events?order_id=eq.${id}&select=*&order=created_at.desc&limit=50`));
}

/* ---------- administration (every call below only works for people listed in the admins table) ---------- */

export async function checkAdmin(rest: Rest, userId: string): Promise<boolean> {
  const rows = await read<{ user_id: string }[]>(await rest(`admins?user_id=eq.${userId}&select=user_id`));
  return rows.length > 0;
}

export async function adminListings(rest: Rest, status?: ListingStatus): Promise<MarketListing[]> {
  const f = status ? `&status=eq.${status}` : '';
  return read<MarketListing[]>(await rest(`listings?select=*${f}&order=created_at.desc&limit=500`));
}

export async function adminReports(rest: Rest, status: 'open' | 'all' = 'open'): Promise<MarketReport[]> {
  const f = status === 'open' ? '&status=eq.open' : '';
  return read<MarketReport[]>(await rest(`reports?select=*${f}&order=created_at.desc&limit=300`));
}

export async function adminHandleReport(rest: Rest, id: string, adminId: string, status: 'dismissed' | 'actioned'): Promise<void> {
  const res = await rest(`reports?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status, handled_by: adminId, handled_at: new Date().toISOString() }),
  });
  if (!res.ok) throw await failure(res);
}

export async function adminRecentEvents(rest: Rest): Promise<HistoryEvent[]> {
  return read<HistoryEvent[]>(await rest('listing_events?select=*&order=created_at.desc&limit=60'));
}

export async function adminOrders(rest: Rest): Promise<MarketOrder[]> {
  return read<MarketOrder[]>(await rest('orders?select=*&order=created_at.desc&limit=500'));
}

/** Rule-of-thumb warning signs for a listing. These are hints for a human to look at, not verdicts. */
export function flagsFor(l: MarketListing, openReports: number, sellerActive24h: number): string[] {
  const out: string[] = [];
  if (l.market_price && l.market_price > 0) {
    if (l.price < l.market_price * 0.4) out.push('Price is under 40% of market (possible scam bait)');
    if (l.price > l.market_price * 3) out.push('Price is over 3x market');
  }
  if (openReports >= 2) out.push(`${openReports} open reports`);
  if (sellerActive24h >= 15) out.push(`Seller posted ${sellerActive24h} listings in 24h`);
  if (l.photo_urls.length === 0 && !l.image_url) out.push('No photo');
  if (/\b(zelle|cashapp|cash app|venmo|western union|gift card|bitcoin|crypto)\b/i.test(`${l.title} ${l.description}`)) out.push('Mentions off-platform payment');
  return out;
}
