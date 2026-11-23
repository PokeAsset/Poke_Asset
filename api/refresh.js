// Scheduled price refresh (Vercel cron calls this once a day). It walks through every set, a few at a time,
// saving sealed-product prices into Supabase. When a full pass is done it waits 14 days before starting the next.
const { send, fetchTimeout } = require('./_util');
const cache = require('./_cache');
const { PROVIDERS } = require('./_providers');

const DAY = 86400000;
const EVERY_DAYS = 14;

async function setNames() {
  const h = process.env.POKEMONTCG_API_KEY ? { 'X-Api-Key': process.env.POKEMONTCG_API_KEY } : {};
  const r = await fetchTimeout('https://api.pokemontcg.io/v2/sets?select=name,releaseDate&orderBy=-releaseDate&pageSize=250', { headers: h }, 25000);
  if (!r.ok) throw new Error(`pokemontcg.io answered ${r.status}`);
  const j = await r.json();
  return (j.data || []).map((s) => s.name);
}

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return send(res, 503, { error: 'Set CRON_SECRET in Vercel first.' });
  const q = req.query || {};
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || String(q.key || '');
  if (given !== secret) return send(res, 401, { error: 'Not allowed.' });
  if (!cache.configured()) return send(res, 503, { error: 'Set SUPABASE_URL and SUPABASE_SERVICE_KEY in Vercel first.' });
  const provider = PROVIDERS.find((p) => p.configured());
  if (!provider) return send(res, 503, { error: 'Set POKETRACE_API_KEY or PRICE_API_KEY in Vercel first.' });

  const started = Date.now();
  const log = { sets: [], saved: 0 };
  try {
    let st = (await cache.getMeta('sealed_refresh')) || {};
    const force = q.force === '1';
    if (st.doneAt && !force && started - Date.parse(st.doneAt) < EVERY_DAYS * DAY) {
      const next = new Date(Date.parse(st.doneAt) + EVERY_DAYS * DAY).toISOString();
      return send(res, 200, { ok: true, skipped: true, message: `Prices are fresh. Next refresh starts after ${next}.`, doneAt: st.doneAt });
    }
    if (!st.names || !st.names.length || st.doneAt) {
      st = { names: await setNames(), idx: 0, startedAt: new Date().toISOString(), doneAt: null, spent: 0 };
    }
    const budget = Number(process.env.REFRESH_CREDITS) || 80; // credits the service lets you use per day (free plan: 100)
    const perSet = 20;
    let spent = 0;
    let stopped = '';
    while (st.idx < st.names.length) {
      if (spent + perSet > budget) { stopped = 'daily credit budget reached'; break; }
      if (Date.now() - started > 45000) { stopped = 'time limit for one run'; break; }
      const name = st.names[st.idx];
      try {
        if (provider.gapMs && log.sets.length) await new Promise((ok) => setTimeout(ok, provider.gapMs));
        const r = await provider.sealed({ set: name, limit: perSet });
        spent += r.cost || Math.max(1, r.items.length);
        log.saved += await cache.saveSealed(r.items, name);
        log.sets.push(`${name}: ${r.items.length}`);
        st.idx += 1;
      } catch (e) {
        stopped = `${name}: ${e.message}`;
        if (e.status === 429 || e.status === 401 || e.status === 403) break; // out of credits or key problem: try again tomorrow
        st.idx += 1; // a bad set should not block the rest
      }
    }
    if (st.idx >= st.names.length) st.doneAt = new Date().toISOString();
    st.spent = (st.spent || 0) + spent;
    await cache.setMeta('sealed_refresh', st);
    return send(res, 200, { ok: true, progress: `${st.idx} of ${st.names.length} sets`, done: !!st.doneAt, stopped, creditsUsedThisRun: spent, ...log });
  } catch (e) {
    return send(res, 500, { error: e.message || 'Refresh failed.', ...log });
  }
};
