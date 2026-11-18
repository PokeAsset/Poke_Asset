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

const pokemonPriceTracker = {
  id: 'pokemonpricetracker',
  label: 'PokemonPriceTracker',
  configured: () => !!process.env.PRICE_API_KEY,
  async sealed({ search, set }) {
    const params = {};
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
      market: num(p.marketPrice ?? (p.prices && p.prices.market)),
      low: num(p.lowPrice ?? (p.prices && p.prices.low)),
      updatedAt: p.lastPriceUpdate || p.updatedAt || null,
      history: findSeries(p.priceHistory) || null,
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
