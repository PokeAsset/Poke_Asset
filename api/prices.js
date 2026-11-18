const { limited, send } = require('./_util');

const { normalizeCard, listOf, ppt } = require('./_pricing');
const { sealedFromProviders } = require('./_providers');

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
      const r = await sealedFromProviders({ search, set });
      if (!r.configured) {
        return send(res, 503, {
          error: 'PRICE_API_KEY is not set on the server, so sealed prices are off.',
          notConfigured: true,
        });
      }
      if (q.debug === '1') return send(res, 200, { debug: r.debug, errors: r.errors });
      if (r.items.length === 0 && r.errors.length) {
        const e = r.errors[0];
        const keyProblem = e.status === 401 || e.status === 403 || /key/i.test(e.message);
        return send(res, keyProblem ? 401 : 502, {
          error: keyProblem
            ? `The price service rejected PRICE_API_KEY (${e.message}). Check the key in Vercel: it must be the full key from your pokemonpricetracker.com account.`
            : `The price service had a problem: ${e.message}`,
          errors: r.errors,
        });
      }
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
