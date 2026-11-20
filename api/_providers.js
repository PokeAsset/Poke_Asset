// Sealed-product price providers. Each provider returns items in one shape, so another legitimate source
// can be added here later without touching the screens. Never scrape a site and never invent a price.
const { num, listOf, findSeries, ppt } = require('./_pricing');

/** Pulls edition / variant words out of a product name so prices stay with the right version. */
function variantOf(name) {
  const n = String(name || '');
  const out = [];
  if (/1st edition/i.test(n)) out.push('1st Edition');
  if (/unlimited/i.test(n)) out.push('Unlimited');
  if (/pok[eé]mon center/i.test(n)) out.push('Pokémon Center');
  if (/costco/i.test(n)) out.push('Costco');
  if (/target/i.test(n)) out.push('Target');
  if (/walmart/i.test(n)) out.push('Walmart');
  if (/case/i.test(n)) out.push('Case');
  if (/japanese|\bjp\b/i.test(n)) out.push('Japanese');
  return out.length ? out.join(', ') : null;
}

/** Reads a price from whichever field the service uses. Checks known names first, then any numeric field whose name says market/unopened/low. */
function pickPrice(p, kind) {
  const pr = p && typeof p.prices === 'object' && p.prices ? p.prices : {};
  const names = kind === 'low'
    ? ['lowPrice', 'low', 'lowestPrice', 'unopenedLow']
    : ['marketPrice', 'unopenedPrice', 'market', 'unopened', 'price', 'currentPrice'];
  for (const src of [p, pr]) {
    for (const k of names) {
      const v = num(src[k]);
      if (v != null) return v;
    }
  }
  const re = kind === 'low' ? /low/i : /market|unopened/i;
  for (const src of [p, pr]) {
    for (const k of Object.keys(src)) {
      if (re.test(k) && !/history|date|updated|count|seller|change|pct|percent/i.test(k)) {
        const v = num(src[k]);
        if (v != null) return v;
      }
    }
  }
  return null;
}

const pokemonPriceTracker = {
  id: 'pokemonpricetracker',
  label: 'PokemonPriceTracker',
  configured: () => !!process.env.PRICE_API_KEY,
  async sealed({ search, set, limit }) {
    // the service charges credits per product returned, so ask for no more than is needed
    const params = { limit: Math.max(1, Math.min(Number(limit) || 30, 60)) };
    if (search) params.search = String(search);
    if (set) params.set = String(set);
    const json = await ppt('sealed-products', params);
    if (json && typeof json === 'object' && !Array.isArray(json) && !json.data && json.raw) {
      const e = new Error('The price service sent back something that is not price data.');
      e.status = 502;
      throw e;
    }
    return { debug: json, items: listOf(json).filter((p) => p && p.name).map((p) => ({
      id: p.tcgPlayerId || p.id || null,
      name: String(p.name),
      setName: p.setName || (p.set && p.set.name) || null,
      type: p.productType || p.type || null,
      variant: variantOf(p.name),
      market: pickPrice(p, 'market'),
      low: pickPrice(p, 'low'),
      updatedAt: p.lastPriceUpdate || p.lastUpdated || p.updatedAt || (p.prices && (p.prices.lastUpdated || p.prices.updatedAt)) || null,
      history: findSeries(p.priceHistory || p.history || (p.prices && p.prices.history)) || null,
      source: 'PokemonPriceTracker (TCGplayer-based market data)',
      provider: 'pokemonpricetracker',
    })) };
  },
};

// Add more providers here (each needs a legitimate, licensed API). TCGplayer itself is not listed because
// it does not give new API access to apps, and scraping it is not allowed.
const PROVIDERS = [pokemonPriceTracker];

/** Runs every configured provider; one failing does not stop the others. */
async function sealedFromProviders(args) {
  const active = PROVIDERS.filter((p) => p.configured());
  const errors = [];
  const items = [];
  let debug = null;
  for (const p of active) {
    try {
      const r = await p.sealed(args);
      items.push(...r.items);
      debug = r.debug;
    } catch (e) {
      errors.push({ provider: p.label, status: e.status || null, message: e.message || 'failed' });
    }
  }
  return { items, errors, configured: active.length > 0, debug };
}

module.exports = { PROVIDERS, sealedFromProviders, variantOf };
