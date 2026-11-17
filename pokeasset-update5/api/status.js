const { send } = require('./_util');

// Tells the app which keys are connected. Never returns a key, only true/false.
module.exports = async (req, res) => {
  send(res, 200, {
    gemini: !!process.env.GEMINI_API_KEY,
    prices: !!process.env.PRICE_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  });
};
