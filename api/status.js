const { send, limited, fetchTimeout, gemini } = require('./_util');
const { sealedFromProviders } = require('./_providers');

// Lists the Gemini models this key can use and times a tiny request on each, so the fastest one can be chosen.
async function compareModels(req, res, base) {
  if (limited(req, 4)) return send(res, 429, { error: 'Too many tests. Wait a minute.' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return send(res, 200, { models: [], error: 'GEMINI_API_KEY is not set.' });
  let names = [];
  try {
    const r = await fetchTimeout('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } }, 15000);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return send(res, 200, { models: [], error: (j.error && j.error.message) || `Google answered ${r.status}` });
    names = (j.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => String(m.name || '').replace(/^models\//, ''))
      .filter((n) => /^gemini/.test(n) && !/(image|tts|embedding|live|audio|robotics|computer|customtools|native)/i.test(n));
  } catch (e) {
    return send(res, 200, { models: [], error: e.message || 'Could not list models.' });
  }
  // prefer light / flash models, newest names first, at most 6
  const rank = (n) => (/lite/.test(n) ? 0 : /flash/.test(n) ? 1 : 2);
  names = names.sort((a, b) => rank(a) - rank(b) || b.localeCompare(a)).slice(0, 6);
  if (!names.includes(base.model)) names = [base.model, ...names.slice(0, 5)];
  const results = await Promise.all(
    names.map(async (model) => {
      const t = Date.now();
      try {
        const r = await fetchTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ok' }] }] }),
          },
          30000,
        );
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return { model, ok: false, ms: Date.now() - t, message: String((j.error && j.error.message) || r.status).slice(0, 140) };
        return { model, ok: true, ms: Date.now() - t, message: 'answered' };
      } catch (e) {
        return { model, ok: false, ms: Date.now() - t, message: e.message || 'failed' };
      }
    }),
  );
  send(res, 200, { current: base.model, models: results.sort((a, b) => (a.ok === b.ok ? a.ms - b.ms : a.ok ? -1 : 1)) });
}

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
  if (q.test === 'models') return compareModels(req, res, base);
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
      const r = await sealedFromProviders({ search: 'booster box', set: '', limit: 1 });
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
      const r = await fetchTimeout(`${url}/rest/v1/listings?select=id&limit=1`, { headers: { apikey: process.env.SUPABASE_ANON_KEY, ...(process.env.SUPABASE_ANON_KEY.startsWith('eyJ') ? { Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}` } : {}) } }, 15000);
      if (r.status === 404 || r.status === 400) throw new Error('Connected, but the marketplace tables are missing. Run supabase/marketplace.sql.');
      if (!r.ok) throw new Error(`Supabase answered ${r.status}`);
      return 'Supabase and the marketplace tables are reachable.';
    }),
  ]);
  send(res, 200, { ...base, tests: { gemini: tests[0], prices: tests[1], catalog: tests[2], accounts: tests[3] } });
};
