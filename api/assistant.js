const { limited, send, readBody, geminiStream } = require('./_util');
const { normalizeCard, listOf, num, ppt } = require('./_pricing');

const SYSTEM =
  'You are the PokéAsset financial assistant for a Pokémon card collector. You can analyse the user\'s portfolio, ' +
  'explain ROI and cost basis, compare singles with sealed product, review recorded sales and expenses, and discuss ' +
  'whether to hold or sell. ' +
  'You have two sources of numbers: (1) the PORTFOLIO CONTEXT below, which holds the user\'s own stored prices, each with a date, ' +
  'and (2) live lookups through your tools lookup_card_price and lookup_sealed_price. ' +
  'Use a tool whenever the user asks what a card or sealed product is worth right now, asks about PSA/CGC/BGS graded value, ' +
  'or you need a current price to judge a hold/sell decision. Do not call a tool for a question the portfolio context already answers. ' +
  'Rules: never invent a price, sale, population number or date. Only quote numbers from the context or from a tool result. ' +
  'When you quote a lookup, say it is a live lookup and give its date if it has one. If a tool returns an error or nothing, say so ' +
  'plainly and fall back to the stored price, labelled as stored. ' +
  'Distinguish an estimate, an asking price and a sold price. For hold/sell questions, give the factors (cost basis, ' +
  'concentration, liquidity, fees, taxes, price trend if known) and a reasoned view, but say you are not a licensed ' +
  'financial advisor and the decision is theirs. If the user asks about expenses and none are recorded, explain that the ' +
  'app tracks cost basis and recorded sales only. ' +
  'Keep answers short and practical. Use plain text, no markdown tables.';

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'lookup_card_price',
        description:
          'Live market price and graded (PSA/CGC/BGS) sale prices for a Pokémon card. Use for current value questions.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Card name, e.g. "Charizard ex"' },
            set: { type: 'string', description: 'Set name, e.g. "Obsidian Flames" (optional)' },
            number: { type: 'string', description: 'Collector number, e.g. "125" (optional)' },
          },
          required: ['name'],
        },
      },
      {
        name: 'lookup_sealed_price',
        description: 'Live market price for a sealed Pokémon product (booster box, Elite Trainer Box, bundle, tin).',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Product name, e.g. "Evolving Skies Booster Box"' },
            set: { type: 'string', description: 'Set name (optional)' },
          },
          required: ['query'],
        },
      },
    ],
  },
];

/** Runs one tool call and returns a small JSON object for the model. Never throws. */
async function runTool(name, args) {
  try {
    if (name === 'lookup_card_price') {
      if (!args || !args.name) return { error: 'name is required' };
      const params = {
        search: [args.name, args.number].filter(Boolean).join(' '),
        limit: '3',
        includeEbay: 'true',
      };
      if (args.set) params.set = String(args.set);
      const cards = listOf(await ppt('cards', params)).slice(0, 3).map(normalizeCard);
      if (cards.length === 0) return { error: 'No card matched that search.' };
      return {
        source: 'live price service (TCGplayer market + recent eBay sales)',
        cards: cards.map((c) => ({
          name: c.name,
          set: c.setName,
          number: c.number,
          marketPrice: c.market,
          lowPrice: c.low,
          gradedSalePrices: Object.fromEntries(Object.entries(c.graded).map(([k, v]) => [k, v.price])),
          priceDate: c.updatedAt,
        })),
      };
    }
    if (name === 'lookup_sealed_price') {
      if (!args || !args.query) return { error: 'query is required' };
      const params = { search: String(args.query) };
      if (args.set) params.set = String(args.set);
      const items = listOf(await ppt('sealed-products', params)).slice(0, 4);
      if (items.length === 0) return { error: 'No sealed product matched that search.' };
      return {
        source: 'live price service',
        products: items.map((p) => ({
          name: p.name,
          set: p.setName || (p.set && p.set.name) || null,
          marketPrice: num(p.marketPrice ?? (p.prices && p.prices.market)),
          lowPrice: num(p.lowPrice ?? (p.prices && p.prices.low)),
          priceDate: p.lastPriceUpdate || p.updatedAt || null,
        })),
      };
    }
    return { error: 'Unknown tool.' };
  } catch (e) {
    if (e.code === 'not_configured') return { error: 'The live price service is not connected (PRICE_API_KEY missing).' };
    return { error: e.message || 'Lookup failed.' };
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (limited(req, 20)) return send(res, 429, { error: 'Too many requests. Wait a minute and try again.' });
  const body = await readBody(req);
  const msgs = Array.isArray(body.messages) ? body.messages.slice(-16) : [];
  const context = typeof body.context === 'string' ? body.context.slice(0, 9000) : '';
  const stream = body.stream === true;
  if (msgs.length === 0) return send(res, 400, { error: 'No message.' });

  // conversation as Gemini turns; it must start with a user turn
  const contents = msgs
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.text || '').slice(0, 3000) }] }))
    .filter((c) => c.parts[0].text);
  while (contents.length && contents[0].role !== 'user') contents.shift();
  if (contents.length === 0) return send(res, 400, { error: 'No message.' });

  const system = `${SYSTEM}\n\nPORTFOLIO CONTEXT (from the user's app, may be empty):\n${context || '(none)'}`;
  const lookups = [];
  const started = Date.now();

  let write = () => {};
  let full = '';
  if (stream) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    write = (o) => res.write(JSON.stringify(o) + '\n');
  }
  const onText = (t) => {
    full += t;
    write({ t: 'text', v: t });
  };
  const fail = (e) => {
    const out = { error: e.message || 'Assistant request failed.', notConfigured: e.code === 'not_configured' };
    if (stream) {
      write({ t: 'error', v: out.error, notConfigured: out.notConfigured });
      return res.end();
    }
    return send(res, e.code === 'not_configured' ? 503 : 502, out);
  };

  try {
    // up to 3 rounds of tool use, then a final answer
    for (let round = 0; round < 4; round++) {
      if (Date.now() - started > 50000) throw Object.assign(new Error('The assistant ran out of time. Try a simpler question.'), { code: 'timeout' });
      full = round === 0 ? '' : full; // text before a tool call is kept; the final answer continues it
      const turn = await geminiStream({ system, contents, tools: round < 3 ? TOOLS : undefined, onText: stream ? onText : (t) => { full += t; } });
      const calls = turn.parts.filter((p) => p.functionCall);
      if (calls.length === 0) {
        const text = turn.parts.map((p) => p.text || '').join('').trim();
        if (!text && !full.trim()) throw Object.assign(new Error('The assistant returned an empty answer. Try again.'), { code: 'upstream' });
        if (stream) {
          write({ t: 'done', lookups });
          return res.end();
        }
        return send(res, 200, { ok: true, text: full.trim() || text, lookups });
      }
      contents.push(turn);
      const results = [];
      for (const c of calls.slice(0, 3)) {
        const a = c.functionCall.args || {};
        write({ t: 'status', v: c.functionCall.name === 'lookup_card_price' ? `Looking up the price of ${a.name || 'a card'}…` : `Looking up ${a.query || 'a sealed product'}…` });
        const out = await runTool(c.functionCall.name, a);
        lookups.push(`${c.functionCall.name === 'lookup_card_price' ? 'card' : 'sealed'}: ${a.name || a.query || ''}${out.error ? ' (failed)' : ''}`);
        results.push({ functionResponse: { name: c.functionCall.name, response: { result: out } } });
      }
      contents.push({ role: 'user', parts: results });
    }
    throw Object.assign(new Error('The assistant took too many steps. Try a simpler question.'), { code: 'upstream' });
  } catch (e) {
    return fail(e);
  }
};
