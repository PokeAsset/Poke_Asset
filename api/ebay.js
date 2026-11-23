// eBay listings through eBay's official Browse API. Needs EBAY_CLIENT_ID and EBAY_CLIENT_SECRET (Production keyset).
// Nothing is scraped. Each result carries eBay's own link, which the app opens for the actual listing.
const { limited, send, fetchTimeout } = require('./_util');

let token = null; // { value, until }

async function getToken() {
  if (token && Date.now() < token.until) return token.value;
  const basic = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString('base64');
  const r = await fetchTimeout('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
    body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
  }, 15000);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    const e = new Error(`eBay rejected the keys (${j.error_description || j.error || r.status}). Check EBAY_CLIENT_ID and EBAY_CLIENT_SECRET (the Production keyset) in Vercel.`);
    e.status = 401;
    throw e;
  }
  token = { value: j.access_token, until: Date.now() + Math.max(60, (j.expires_in || 7200) - 120) * 1000 };
  return token.value;
}

async function search(params, auth) {
  const r = await fetchTimeout(`https://api.ebay.com/buy/browse/v1/item_summary/search?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${auth}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US', Accept: 'application/json' },
  }, 20000);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error((j.errors && j.errors[0] && j.errors[0].message) || `eBay answered ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return j;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { error: 'GET only' });
  if (limited(req, 30)) return send(res, 429, { error: 'Too many requests. Wait a minute and try again.' });
  if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET) {
    return send(res, 503, { error: 'eBay listings are not set up yet (EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are missing in Vercel).', notConfigured: true });
  }
  const q = req.query || {};
  const text = String(q.q || '').trim().slice(0, 100);
  if (!text) return send(res, 400, { error: 'Type what to look for.' });
  const sorts = { best: '', 'price-low': 'price', 'price-high': '-price', newest: 'newlyListed' };
  const params = { q: /pok[eé]mon/i.test(text) ? text : `pokemon ${text}`, limit: '24', offset: String(Math.max(0, parseInt(q.offset, 10) || 0)) };
  if (sorts[q.sort]) params.sort = sorts[q.sort];
  if (q.type === 'cards') params.category_ids = '183454'; // Pokémon individual cards
  try {
    const auth = await getToken();
    let j;
    try {
      j = await search(params, auth);
    } catch (e) {
      if (!params.category_ids) throw e;
      delete params.category_ids; // wrong category id should not break search
      j = await search(params, auth);
    }
    const items = (j.itemSummaries || []).filter((i) => i && i.itemWebUrl).map((i) => ({
      id: i.itemId,
      title: i.title,
      price: i.price ? Number(i.price.value) : null,
      currency: i.price ? i.price.currency : null,
      image: i.image ? i.image.imageUrl : null,
      condition: i.condition || null,
      seller: i.seller ? i.seller.username : null,
      sellerFeedback: i.seller ? i.seller.feedbackPercentage : null,
      shipping: i.shippingOptions && i.shippingOptions[0] && i.shippingOptions[0].shippingCost ? Number(i.shippingOptions[0].shippingCost.value) : null,
      buyingOptions: i.buyingOptions || [],
      url: i.itemWebUrl,
    }));
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return send(res, 200, { ok: true, items, total: j.total || items.length, fetchedAt: new Date().toISOString() });
  } catch (e) {
    return send(res, e.status === 401 ? 401 : 502, { error: e.message || 'eBay search failed.' });
  }
};
