// Shared price cache in Supabase. Needs SUPABASE_URL and SUPABASE_SERVICE_KEY (the secret key, server only).
const { fetchTimeout } = require('./_util');

function base() {
  try {
    return new URL(process.env.SUPABASE_URL || '').origin;
  } catch {
    return '';
  }
}
const key = () => process.env.SUPABASE_SERVICE_KEY || '';
const configured = () => !!(base() && key());

function headers(extra) {
  const k = key();
  const h = { apikey: k, 'Content-Type': 'application/json', ...(extra || {}) };
  if (k.startsWith('eyJ')) h.Authorization = `Bearer ${k}`; // legacy JWT keys only; sb_secret_ keys go in apikey alone
  return h;
}

async function sb(path, opts, ms) {
  const r = await fetchTimeout(`${base()}/rest/v1/${path}`, { ...(opts || {}), headers: headers(opts && opts.headers) }, ms || 15000);
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    const e = new Error(`Supabase ${r.status}${j.message ? `: ${j.message}` : ''}`);
    e.status = r.status;
    throw e;
  }
  return r.status === 204 ? null : r.json().catch(() => null);
}

const toItem = (r) => ({
  id: r.id,
  name: r.name,
  setName: r.set_name,
  type: r.type,
  variant: r.variant,
  market: r.market == null ? null : Number(r.market),
  low: r.low == null ? null : Number(r.low),
  updatedAt: r.price_updated,
  imageUrl: r.image_url,
  tcgPlayerId: r.tcg_player_id,
  history: r.history || null,
  source: r.source ? `${r.source} · saved copy` : 'saved copy',
  provider: r.provider,
  fetchedAt: r.fetched_at,
});

/** Saved sealed products for a set (or matching a name). Returns [] when nothing is saved. */
async function readSealed({ set, search }) {
  let filter = '';
  if (set) filter = `query_set=eq.${encodeURIComponent(set)}`;
  else if (search) filter = `name=ilike.${encodeURIComponent(`*${String(search).replace(/[*%,()]/g, ' ').trim()}*`)}`;
  else return [];
  const rows = await sb(`sealed_prices?select=*&${filter}&order=market.desc.nullslast&limit=200`);
  return (rows || []).map(toItem);
}

async function saveSealed(items, querySet) {
  const seen = new Map();
  items.forEach((p) => {
    const id = `${p.provider || 'p'}:${p.tcgPlayerId || p.id || p.name}`;
    seen.set(id, {
      id,
      query_set: querySet || null,
      name: p.name,
      set_name: p.setName || null,
      type: p.type || null,
      variant: p.variant || null,
      market: p.market,
      low: p.low,
      price_updated: p.updatedAt || null,
      image_url: p.imageUrl || null,
      tcg_player_id: p.tcgPlayerId ? String(p.tcgPlayerId) : null,
      source: p.source || null,
      provider: p.provider || null,
      history: p.history || null,
      fetched_at: new Date().toISOString(),
    });
  });
  const rows = [...seen.values()];
  if (!rows.length) return 0;
  await sb('sealed_prices?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) }, 20000);
  return rows.length;
}

async function getMeta(k) {
  const rows = await sb(`price_meta?select=value&key=eq.${encodeURIComponent(k)}`);
  return rows && rows[0] ? rows[0].value : null;
}
async function setMeta(k, value) {
  await sb('price_meta?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ key: k, value, updated_at: new Date().toISOString() }]),
  });
}

module.exports = { configured, readSealed, saveSealed, getMeta, setMeta };
