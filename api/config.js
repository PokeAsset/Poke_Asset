const { send } = require('./_util');

// Public settings for accounts. Only the project address and the PUBLIC (anon / publishable) key are ever sent.
// Anything that does not look right is refused, so a secret pasted into the wrong box can never be published.
function roleOf(jwt) {
  try {
    const body = String(jwt).split('.')[1];
    return JSON.parse(Buffer.from(body, 'base64').toString('utf8')).role || null;
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  const rawUrl = String(process.env.SUPABASE_URL || '').trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || '').trim();
  if (!rawUrl || !anonKey) return send(res, 200, { enabled: false });

  let url = '';
  try {
    const u = new URL(rawUrl);
    if (u.protocol === 'https:' && /\.supabase\.(co|in)$/i.test(u.hostname)) url = u.origin; // drops any stray path
  } catch {
    // not an address
  }
  if (!url) {
    return send(res, 200, {
      enabled: false,
      problem: 'SUPABASE_URL must be the Project URL, like https://abcdefgh.supabase.co. It is not.',
    });
  }
  if (/^sb_secret_/.test(anonKey)) {
    return send(res, 200, { enabled: false, problem: 'SUPABASE_ANON_KEY holds a secret key. Use the publishable key (sb_publishable_…).' });
  }
  if (/^eyJ/.test(anonKey) && roleOf(anonKey) === 'service_role') {
    return send(res, 200, {
      enabled: false,
      problem: 'SUPABASE_ANON_KEY holds the secret service_role key. Use the anon / publishable key instead.',
    });
  }
  send(res, 200, { enabled: true, url, anonKey });
};
