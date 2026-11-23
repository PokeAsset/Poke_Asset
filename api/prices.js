const { limited, send } = require('./_util');

const { normalizeCard, listOf, ppt } = require('./_pricing');
const { sealedFromProviders } = require('./_providers');
const cache = require('./_cache');

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
      const search = String(q.q || '');
      const set = q.set ? String(q.set) : '';
      if (!search && !set) return send(res, 400, { error: 'Type a product name or choose a set.' });
      // saved copy first: it costs no credits and is the same for every visitor. "fresh=1" (Refresh button) asks the service again.
      if (cache.configured() && q.fresh !== '1') {
        try {
          const saved = await cache.readSealed({ set, search });
          if (saved.length) {
            res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
            const newest = saved.map((x) => x.fetchedAt).filter(Boolean).sort().pop();
            return send(res, 200, { ok: true, items: saved, errors: [], cached: true, fetchedAt: newest || new Date().toISOString() });
          }
        } catch (e) { /* cache problem: fall through to the live service */ }
      }
      const r = await sealedFromProviders({ search, set, limit: q.limit });
      if (!r.configured) {
        return send(res, 503, {
          error: 'No price key is set on the server (POKETRACE_API_KEY or PRICE_API_KEY), so sealed prices are off.',
          notConfigured: true,
        });
      }
      if (q.debug === '1') return send(res, 200, { debug: r.debug, errors: r.errors });
      if (r.items.length === 0 && r.errors.length) {
        const e = r.errors[0];
        const keyProblem = e.status === 401 || e.status === 403 || /key/i.test(e.message);
        return send(res, keyProblem ? 401 : 502, {
          error: keyProblem
            ? `The price service (${e.provider}) rejected its key (${e.message}). Check the key in Vercel: it must be the full key copied from that service's account page.`
            : `The price service had a problem: ${e.message}`,
          errors: r.errors,
        });
      }
      if (cache.configured() && r.items.length) cache.saveSealed(r.items, set || null).catch(() => {});
      // identical requests are answered from the edge cache for 6 hours, which saves the price service's daily credits
      if (!r.errors.length && r.items.length) res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=3600');
      return send(res, 200, { ok: true, items: r.items, errors: r.errors, fetchedAt: new Date().toISOString() });
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
