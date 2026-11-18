// Shared helpers for the PokéAsset server functions. Files starting with "_" are not exposed as routes.

const hits = new Map();

/** Small per-instance rate limit so a public URL cannot burn your API credits. */
function limited(req, perMinute) {
  const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown').trim();
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > perMinute;
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return {};
  }
}

const GEMINI_MODEL = () => process.env.GEMINI_MODEL || 'gemini-3.8-flash';

/** Calls Gemini's generateContent. Returns the text of the first candidate. */
async function gemini({ system, parts, json }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const e = new Error('GEMINI_API_KEY is not set on the server.');
    e.code = 'not_configured';
    throw e;
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL()}:generateContent`;
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.3, ...(json ? { responseMimeType: 'application/json' } : {}) },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error((data && data.error && data.error.message) || `Gemini request failed (${r.status})`);
    e.code = 'upstream';
    throw e;
  }
  const text = (((data.candidates || [])[0] || {}).content || {}).parts;
  return (text || []).map((p) => p.text || '').join('').trim();
}

/**
 * Lower-level Gemini call for multi-turn conversations and function calling.
 * Returns the model's content (role + parts) exactly as received, so it can be sent back unchanged.
 */
async function geminiTurn({ system, contents, tools }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const e = new Error('GEMINI_API_KEY is not set on the server.');
    e.code = 'not_configured';
    throw e;
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL()}:generateContent`;
  const body = { contents, generationConfig: { temperature: 0.3 } };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (tools) body.tools = tools;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error((data && data.error && data.error.message) || `Gemini request failed (${r.status})`);
    e.code = 'upstream';
    throw e;
  }
  const cand = (data.candidates || [])[0];
  if (!cand || !cand.content) {
    const e = new Error('Gemini returned no answer (it may have been blocked). Try rephrasing.');
    e.code = 'upstream';
    throw e;
  }
  return { role: 'model', parts: cand.content.parts || [] };
}

module.exports = { limited, send, readBody, gemini, geminiTurn };
