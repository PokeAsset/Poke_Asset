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
  if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-store');
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

/** fetch that gives up after `ms` instead of hanging until the platform kills the function. */
async function fetchTimeout(url, opts, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } catch (e) {
    if (e && e.name === 'AbortError') {
      const err = new Error(`The service did not answer within ${Math.round(ms / 1000)} seconds.`);
      err.code = 'timeout';
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Turns Gemini's HTTP errors into messages that say what to fix. */
function geminiError(status, message) {
  const m = String(message || '');
  let text;
  if (status === 429 || /quota|rate.?limit|resource.?exhausted/i.test(m)) {
    text = 'Gemini is rate-limited or out of free quota right now. Wait a minute and try again, or check usage in Google AI Studio.';
  } else if (/api key not valid|api_key_invalid|permission.?denied|unauthenticated/i.test(m) || status === 401 || status === 403) {
    text = 'Google rejected the Gemini key. Create a new key in Google AI Studio and update GEMINI_API_KEY in Vercel, then redeploy.';
  } else if (status === 404 || /no longer available|not found|not supported/i.test(m)) {
    text = `The model "${GEMINI_MODEL()}" is not available to this key. Set GEMINI_MODEL in Vercel to a current model name. Google said: ${m.slice(0, 200)}`;
  } else if (status >= 500) {
    text = 'Google\'s Gemini service had a temporary problem. Try again in a moment.';
  } else {
    text = m || `Gemini request failed (${status}).`;
  }
  const e = new Error(text);
  e.code = 'upstream';
  e.status = status;
  return e;
}

const genConfig = () => {
  const cfg = { temperature: 0.3 };
  const lvl = process.env.GEMINI_THINKING; // optional: minimal | low | medium | high
  if (lvl) cfg.thinkingConfig = { thinkingLevel: lvl };
  return cfg;
};

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
    generationConfig: { ...genConfig(), ...(json ? { responseMimeType: 'application/json' } : {}) },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const r = await fetchTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  }, 40000);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw geminiError(r.status, data && data.error && data.error.message);
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
  const body = { contents, generationConfig: genConfig() };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (tools) body.tools = tools;
  const r = await fetchTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  }, 40000);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw geminiError(r.status, data && data.error && data.error.message);
  const cand = (data.candidates || [])[0];
  if (!cand || !cand.content) {
    const e = new Error('Gemini returned no answer (it may have been blocked). Try rephrasing.');
    e.code = 'upstream';
    throw e;
  }
  return { role: 'model', parts: cand.content.parts || [] };
}

/**
 * Streaming version of geminiTurn. Calls onText(delta) as text arrives and returns the full model turn
 * (role + parts) so function calls can be answered and the conversation continued.
 */
async function geminiStream({ system, contents, tools, onText, ms = 45000 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const e = new Error('GEMINI_API_KEY is not set on the server.');
    e.code = 'not_configured';
    throw e;
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL()}:streamGenerateContent?alt=sse`;
  const body = { contents, generationConfig: genConfig() };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (tools) body.tools = tools;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  const parts = [];
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw geminiError(r.status, data && data.error && data.error.message);
    }
    const decoder = new TextDecoder();
    let buf = '';
    let blocked = null;
    const handle = (line) => {
      if (!line.startsWith('data:')) return;
      const raw = line.slice(5).trim();
      if (!raw || raw === '[DONE]') return;
      let j;
      try {
        j = JSON.parse(raw);
      } catch {
        return;
      }
      if (j.promptFeedback && j.promptFeedback.blockReason) blocked = j.promptFeedback.blockReason;
      const cand = (j.candidates || [])[0];
      for (const p of (cand && cand.content && cand.content.parts) || []) {
        if (p.thought) continue;
        if (typeof p.text === 'string') {
          const last = parts[parts.length - 1];
          if (last && typeof last.text === 'string' && !last.functionCall) last.text += p.text;
          else parts.push({ text: p.text });
          if (p.text && onText) onText(p.text);
        } else {
          parts.push(p);
        }
      }
    };
    for await (const chunk of r.body) {
      buf += decoder.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        handle(buf.slice(0, i).trim());
        buf = buf.slice(i + 1);
      }
    }
    handle(buf.trim());
    if (parts.length === 0) {
      const e = new Error(blocked ? 'Gemini blocked that request. Try rephrasing.' : 'Gemini returned an empty answer. Try again.');
      e.code = 'upstream';
      throw e;
    }
    return { role: 'model', parts };
  } catch (e) {
    if (e && e.name === 'AbortError') {
      const err = new Error(`Gemini did not finish within ${Math.round(ms / 1000)} seconds. Try a shorter question.`);
      err.code = 'timeout';
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { limited, send, readBody, gemini, geminiTurn, geminiStream, fetchTimeout, geminiError };
