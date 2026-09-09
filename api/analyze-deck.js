'use strict';
const { analyzeDeck } = require('../lib/deck-service');
const requests = new Map();
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'POST only' }); }
  const origin = req.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Use the importer on this site.' }); }
    catch { return res.status(403).json({ error: 'Invalid request origin.' }); }
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || JSON.stringify(body).length > 65000) return res.status(413).json({ error: 'Deck request is too large.' });
    const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || 'local').split(',')[0];
    const now = Date.now();
    let bucket = requests.get(ip);
    if (!bucket || bucket.until < now) { bucket = { count: 0, until: now + 60000 }; requests.set(ip, bucket); }
    if (++bucket.count > 8) { res.setHeader('Retry-After', '60'); return res.status(429).json({ error: 'Please wait a minute before importing again.' }); }
    if (requests.size > 2000) for (const [key, value] of requests) if (value.until < now) requests.delete(key);
    const result = await analyzeDeck(body.deck, { analyze: body.analyze !== false });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'The deck could not be imported.' });
  }
};
