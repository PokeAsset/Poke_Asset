// Pass-through to the pokemontcg.io catalog with a timeout, one retry and edge caching.
// Browsers call this instead of pokemontcg.io directly, so a slow or blocked upstream gives a clear message
// instead of "Load failed". Optional env var POKEMONTCG_API_KEY (free at dev.pokemontcg.io) raises the rate limit.
const { limited, send, fetchTimeout } = require('./_util');

const ALLOWED = new Set(['cards', 'sets']);

module.exports = async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { error: 'GET only' });
  if (limited(req, 120)) return send(res, 429, { error: 'Too many requests. Wait a minute and try again.' });
  const q = req.query || {};
  const kind = String(q.kind || 'cards');
  if (!ALLOWED.has(kind)) return send(res, 400, { error: 'Unknown catalog.' });
  const params = new URLSearchParams();
  for (const k of ['q', 'pageSize', 'page', 'orderBy', 'select']) if (q[k] != null) params.set(k, String(q[k]).slice(0, 2000));
  const url = `https://api.pokemontcg.io/v2/${kind}?${params.toString()}`;
  const headers = process.env.POKEMONTCG_API_KEY ? { 'X-Api-Key': process.env.POKEMONTCG_API_KEY } : {};
  let lastErr = 'The card catalog did not respond.';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetchTimeout(url, { headers }, 22000);
      const text = await r.text();
      if (r.ok) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
        return res.end(text);
      }
      lastErr = `The card catalog answered with an error (${r.status}).`;
      if (r.status < 500 && r.status !== 429) break;
    } catch (e) {
      lastErr = e.code === 'timeout' ? 'The card catalog (pokemontcg.io) is slow right now. Try again in a moment.' : 'Could not reach the card catalog.';
    }
  }
  return send(res, 502, { error: lastErr });
};
