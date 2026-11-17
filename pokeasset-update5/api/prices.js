const { limited, send } = require('./_util');

const { findSeries, normalizeCard, listOf, num, ppt } = require('./_pricing');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { error: 'GET only' });
  if (limited(req, 40)) return send(res, 429, { error: 'Too many requests. Wait a minute and try again.' });
  const q = req.query || {};
  const action = q.action;
  const call = ppt;
  try {
    if (action === 'card') {
      const params = { limit: '5', includeEbay: 'true', includeHistory: 'true', days: String(q.days || 90) };
      if (q.tcgPlayerId) params.tcgPlayerId = String(q.tcgPlayerId);
      else {
        if (!q.name) return send(res, 400, { error: 'name is required' });
        params.search = [q.name, q.number].filter(Boolean).join(' ');
        if (q.set) params.set = String(q.set);
      }
      const json = await call('cards', params);
      if (q.debug === '1') return send(res, 200, { debug: json });
      const cards = listOf(json).map(normalizeCard);
      return send(res, 200, { ok: true, cards });
    }
    if (action === 'sealed') {
      const params = { search: String(q.q || '') };
      if (q.set) params.set = String(q.set);
      if (!params.search && !params.set) return send(res, 400, { error: 'Type a product name or choose a set.' });
      const json = await call('sealed-products', params);
      if (q.debug === '1') return send(res, 200, { debug: json });
      const items = listOf(json).map((p) => ({
        id: p.tcgPlayerId || p.id || null,
        name: p.name,
        setName: p.setName || (p.set && p.set.name) || null,
        type: p.productType || p.type || null,
        market: num(p.marketPrice ?? (p.prices && p.prices.market)),
        low: num(p.lowPrice ?? (p.prices && p.prices.low)),
        updatedAt: p.lastPriceUpdate || p.updatedAt || null,
        history: findSeries(p.priceHistory) || null,
      }));
      return send(res, 200, { ok: true, items });
    }
    return send(res, 400, { error: 'Unknown action.' });
  } catch (e) {
    if (e.code === 'not_configured') {
      return send(res, 503, {
        error: 'PRICE_API_KEY is not set on the server, so graded prices, history and sealed products are off.',
        notConfigured: true,
      });
    }
    return send(res, e.status === 401 || e.status === 403 ? 401 : 502, { error: e.message || 'Price request failed.' });
  }
};
