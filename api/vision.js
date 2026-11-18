const { limited, send, readBody, gemini } = require('./_util');

const PROMPTS = {
  card:
    'You identify Pokémon trading cards from a photo. Read the printed text on the card. ' +
    'Return JSON: {"name": string, "setName": string|null, "number": string|null (collector number before the slash), ' +
    '"printedTotal": string|null, "rarity": string|null, "confidence": number 0-1, "notes": string}. ' +
    'If it is not a Pokémon card or unreadable, return {"name": null, "confidence": 0, "notes": "why"}. Never invent a card.',
  sealed:
    'You identify sealed Pokémon TCG products from a photo of the packaging (booster box, Elite Trainer Box, bundle, tin, blister, collection box). ' +
    'Return JSON: {"productName": string, "setName": string|null, "productType": string|null, "language": string|null, ' +
    '"confidence": number 0-1, "notes": string}. If unreadable or not a Pokémon product, return {"productName": null, "confidence": 0, "notes": "why"}. Never invent a product.',
  grade:
    'You are a careful trading-card grading assistant. From the photos (front first, then back, then optional close-ups) estimate condition. ' +
    'Be conservative: photos cannot show everything. Return JSON: ' +
    '{"centering": {"front": string like "55/45", "back": string|null, "note": string}, ' +
    '"corners": {"score": number 1-10, "note": string}, "edges": {"score": number 1-10, "note": string}, ' +
    '"surface": {"score": number 1-10, "note": string}, ' +
    '"psaProbabilities": {"10": number, "9": number, "8": number, "7": number, "6OrLower": number} (sum to 1), ' +
    '"psaLow": integer, "psaHigh": integer, "confidence": number 0-1, ' +
    '"cannotJudge": [string], "summary": string}.',
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (limited(req, 12)) return send(res, 429, { error: 'Too many requests. Wait a minute and try again.' });
  const body = await readBody(req);
  const task = body.task;
  const images = Array.isArray(body.images) ? body.images.slice(0, 5) : [];
  if (!PROMPTS[task]) return send(res, 400, { error: 'Unknown task.' });
  if (images.length === 0) return send(res, 400, { error: 'Add at least one photo.' });
  for (const im of images) {
    if (!im || typeof im.data !== 'string' || im.data.length > 3_500_000) {
      return send(res, 400, { error: 'A photo is missing or too large. Try a smaller photo.' });
    }
  }
  try {
    const parts = [{ text: PROMPTS[task] }];
    images.forEach((im) => parts.push({ inline_data: { mime_type: im.mime || 'image/jpeg', data: im.data } }));
    const text = await gemini({ parts, json: true });
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return send(res, 502, { error: 'The vision service returned something unreadable. Try again.' });
    }
    return send(res, 200, { ok: true, result: parsed });
  } catch (e) {
    if (e.code === 'not_configured') return send(res, 503, { error: e.message, notConfigured: true });
    return send(res, 502, { error: e.message || 'Vision request failed.' });
  }
};
