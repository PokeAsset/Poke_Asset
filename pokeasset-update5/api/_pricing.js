// Shared price-service helpers (used by prices.js and assistant.js). Not exposed as a route.
const BASE = 'https://www.pokemonpricetracker.com/api/v2';

/* ---- tolerant readers: the upstream response shape is only partly documented ---- */

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)) ? Number(v) : null);

function pickPrice(o) {
  if (!o || typeof o !== 'object') return num(o);
  for (const k of ['smartMarketPrice', 'avg', 'average', 'averagePrice', 'median', 'medianPrice', 'marketPrice', 'market', 'price']) {
    const v = num(o[k]);
    if (v != null) return v;
  }
  return null;
}

/** Finds graded prices like { psa10: {avg: 450} } or { salesByGrade: { psa10: {...} } } anywhere inside ebay. */
function readGraded(ebay) {
  const out = {};
  const seen = new Set();
  const walk = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > 4 || seen.has(o)) return;
    seen.add(o);
    for (const [k, v] of Object.entries(o)) {
      const m = /^(psa|cgc|bgs|sgc)[\s_-]?(\d+(?:\.\d+)?)$/i.exec(k);
      if (m) {
        const price = pickPrice(v);
        if (price != null) {
          out[`${m[1].toUpperCase()} ${m[2]}`] = {
            price,
            sales: v && typeof v === 'object' ? num(v.count ?? v.salesCount ?? v.sales) : null,
          };
        }
      } else if (v && typeof v === 'object') {
        walk(v, depth + 1);
      }
    }
  };
  walk(ebay, 0);
  return out;
}

const dateOf = (o) => o && (o.date || o.day || o.timestamp || o.t || o.createdAt);
const priceOf = (o) => num(o && (o.market ?? o.price ?? o.marketPrice ?? o.avg ?? o.average ?? o.value));

function findSeries(o, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 5) return null;
  if (Array.isArray(o)) {
    const pts = o
      .map((p) => ({ date: dateOf(p), price: priceOf(p) }))
      .filter((p) => p.date && p.price != null)
      .map((p) => ({ date: String(p.date).slice(0, 10), price: p.price }));
    if (pts.length >= 2) return pts;
    return null;
  }
  for (const v of Object.values(o)) {
    const s = findSeries(v, depth + 1);
    if (s) return s;
  }
  return null;
}

function normalizeCard(c) {
  const graded = readGraded(c.ebay);
  const gradedHistory = {};
  const ph = c.priceHistory || {};
  if (ph && typeof ph === 'object' && !Array.isArray(ph)) {
    for (const [k, v] of Object.entries(ph)) {
      if (/^(psa|cgc|bgs|sgc)/i.test(k)) {
        const s = findSeries(v);
        if (s) gradedHistory[k.toUpperCase()] = s;
      }
    }
  }
  return {
    name: c.name,
    setName: c.setName || (c.set && c.set.name) || null,
    number: c.cardNumber || c.number || null,
    tcgPlayerId: c.tcgPlayerId || c.tcgplayerId || null,
    market: num(c.prices && (c.prices.market ?? c.prices.marketPrice)) ?? num(c.marketPrice),
    low: num(c.prices && (c.prices.low ?? c.prices.lowPrice)) ?? num(c.lowPrice),
    graded,
    history: { raw: findSeries(ph.variants || ph.raw || ph) || null, graded: gradedHistory },
    updatedAt: c.lastUpdated || c.updatedAt || (c.prices && c.prices.lastUpdated) || null,
  };
}

const listOf = (j) => (Array.isArray(j) ? j : Array.isArray(j && j.data) ? j.data : j && j.data ? [j.data] : []);


/** Calls the price service. Throws an Error with .status on failure, .code "not_configured" without a key. */
async function ppt(path, params) {
  const key = process.env.PRICE_API_KEY;
  if (!key) {
    const e = new Error('PRICE_API_KEY is not set on the server.');
    e.code = 'not_configured';
    throw e;
  }
  const url = `${BASE}/${path}?${new URLSearchParams(params).toString()}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  if (!r.ok) {
    const e = new Error((json && (json.error || json.message)) || `Price service error (${r.status})`);
    e.status = r.status;
    throw e;
  }
  return json;
}

module.exports = { BASE, num, readGraded, findSeries, normalizeCard, listOf, ppt };
