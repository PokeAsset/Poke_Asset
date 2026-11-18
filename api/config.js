const { send } = require('./_util');

// Public account-service settings for the app. The "anon" / "publishable" key is designed to be public:
// it only identifies your project. What each person can read is limited by the row-level-security
// rules in supabase/setup.sql, not by hiding this key. Never put a "service_role" or "secret" key here.
module.exports = async (req, res) => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return send(res, 200, { enabled: false });
  send(res, 200, { enabled: true, url, anonKey });
};
