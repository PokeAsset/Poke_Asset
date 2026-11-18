const { send, limited, fetchTimeout, gemini } = require('./_util');
const { sealedFromProviders } = require('./_providers');

// Tells the app which keys are connected (true/false only, never a key).
// With ?test=1 it also makes one tiny live call to each service and reports what each one said.
module.exports = async (req, res) => {
  const base = {
    gemini: !!process.env.GEMINI_API_KEY,
    prices: !!process.env.PRICE_API_KEY,
    accounts: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  };
  const q = req.query || {};
  if (q.test !== '1') return send(res, 200, base);
  if (limited(req, 6)) return send(res, 429, { error: 'Too many tests. Wait a minute.' });

  const timed = async (fn) => {
    const t = Date.now();
    try {
      const message = await fn();
      return { ok: true, ms: Date.now() - t, message };
    } catch (e) {
      return { ok: false, ms: Date.now() - t, message: e.message || 'failed' };
    }
  };

  const tests = await Promise.all([
    timed(async () => {
      if (!base.gemini) throw new Error('GEMINI_API_KEY is not set.');
      const t = await gemini({ parts: [{ text: 'Reply with the single word: ok' }] });
      return `Answered (${t.slice(0, 20)}) using ${base.model}.`;
    }),
    timed(async () => {
      if (!base.prices) throw new Error('PRICE_API_KEY is not set.');
      const r = await sealedFromProviders({ search: 'booster box', set: '' });
      if (r.errors.length && !r.items.length) throw new Error(`${r.errors[0].provider}: ${r.errors[0].message}${r.errors[0].status ? ` (${r.errors[0].status})` : ''}`);
      return `${r.items.length} sealed products returned, ${r.items.filter((i) => i.market != null).length} with a price.`;
    }),
    timed(async () => {
      const r = await fetchTimeout('https://api.pokemontcg.io/v2/sets?pageSize=1&select=id', process.env.POKEMONTCG_API_KEY ? { headers: { 'X-Api-Key': process.env.POKEMONTCG_API_KEY } } : {}, 20000);
      if (!r.ok) throw new Error(`pokemontcg.io answered ${r.status}`);
      return 'Card catalog reachable.';
    }),
    timed(async () => {
      if (!base.accounts) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY are not set.');
      const url = process.env.SUPABASE_URL.replace(/\/$/, '');
      const r = await fetchTimeout(`${url}/rest/v1/listings?select=id&limit=1`, { headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}` } }, 15000);
      if (r.status === 404 || r.status === 400) throw new Error('Connected, but the marketplace tables are missing. Run supabase/marketplace.sql.');
      if (!r.ok) throw new Error(`Supabase answered ${r.status}`);
      return 'Supabase and the marketplace tables are reachable.';
    }),
  ]);
  send(res, 200, { ...base, tests: { gemini: tests[0], prices: tests[1], catalog: tests[2], accounts: tests[3] } });
};
