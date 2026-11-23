// Sealed-product price providers. Each provider returns items in one shape, so another legitimate source
// can be added here later without touching the screens. Never scrape a site and never invent a price.
const { num, listOf, findSeries, ppt } = require('./_pricing');
const { fetchTimeout } = require('./_util');

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
      tcgPlayerId: p.tcgPlayerId || null,
      imageUrl: p.imageUrl || p.imageCdnUrl || p.image || (p.images && (p.images.large || p.images.small)) ||
        (p.tcgPlayerId ? `https://product-images.tcgplayer.com/fit-in/437x437/${p.tcgPlayerId}.jpg` : null),
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


/** Finds {avg, low} for the TCGplayer source (or eBay if that is all there is) inside PokeTrace's nested prices object. */
function poketracePrice(prices) {
  const found = { tcgplayer: null, ebay: null };
  const walk = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > 5) return;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if ((k === 'tcgplayer' || k === 'ebay') && v && typeof v === 'object' && !found[k] && (num(v.avg) != null || num(v.low) != null)) found[k] = v;
      else walk(v, depth + 1);
    }
  };
  walk(prices, 0);
  const hit = found.tcgplayer || found.ebay;
  if (!hit) return null;
  return { market: num(hit.avg), low: num(hit.low), from: found.tcgplayer ? 'TCGplayer' : 'eBay sales' };
}

const slug = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const pokeTrace = {
  id: 'poketrace',
  label: 'PokeTrace',
  gapMs: 2100, // free plan allows 1 request every 2 seconds
  configured: () => !!process.env.POKETRACE_API_KEY,
  async call(params) {
    const qs = new URLSearchParams({ product_type: 'sealed', market: 'US', ...params }).toString();
    const r = await fetchTimeout(`https://api.poketrace.com/v2/cards?${qs}`, { headers: { 'X-API-Key': process.env.POKETRACE_API_KEY, Accept: 'application/json' } }, 20000);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(r.status === 429 ? 'PokeTrace is busy or the daily limit is used up. Try again in a few seconds.' : (j.message || j.error || `PokeTrace answered ${r.status}`));
      e.status = r.status;
      throw e;
    }
    return j;
  },
  async sealed({ search, set, limit }) {
    const lim = String(Math.max(1, Math.min(Number(limit) || 30, 50)));
    let json;
    let cost = 1;
    if (set) {
      json = await this.call({ set: slug(set), limit: lim });
      if (!listOf(json).length) { // the set filter may want a different spelling: fall back to a name search
        cost += 1;
        json = await this.call({ search: String(set), limit: lim });
      }
    } else {
      json = await this.call({ search: String(search || ''), limit: lim });
    }
    const items = listOf(json).filter((p) => p && p.name).map((p) => {
      const pr = poketracePrice(p.prices);
      const tid = (p.refs && p.refs.tcgplayerId) || null;
      return {
        id: tid || p.id || null,
        tcgPlayerId: tid,
        imageUrl: p.image || (tid ? `https://product-images.tcgplayer.com/fit-in/437x437/${tid}.jpg` : null),
        name: String(p.name),
        setName: (p.set && p.set.name) || null,
        type: String(p.productFamily || p.productType || '').replace(/_/g, ' ') || null,
        variant: variantOf(p.name),
        market: pr ? pr.market : num(p.market),
        low: pr ? pr.low : null,
        updatedAt: p.lastUpdated || null,
        history: null,
        source: `PokeTrace (${pr ? pr.from : 'TCGplayer'} prices)`,
        provider: 'poketrace',
      };
    });
    return { debug: json, items, cost };
  },
};

// Add more providers here (each needs a legitimate, licensed API). TCGplayer itself is not listed because
// it does not give new API access to apps, and scraping it is not allowed.
// First configured provider that returns products wins; the next one is only a fallback.
const PROVIDERS = [pokeTrace, pokemonPriceTracker];

/** Runs every configured provider; one failing does not stop the others. */
async function sealedFromProviders(args) {
  const active = PROVIDERS.filter((p) => p.configured());
  const errors = [];
  const items = [];
  let debug = null;
  for (const p of active) {
    try {
      const r = await p.sealed(args);
      debug = r.debug;
      if (r.items.length) { items.push(...r.items); break; }
    } catch (e) {
      errors.push({ provider: p.label, status: e.status || null, message: e.message || 'failed' });
    }
  }
  return { items, errors, configured: active.length > 0, debug };
}

module.exports = { PROVIDERS, sealedFromProviders, variantOf, poketracePrice };
