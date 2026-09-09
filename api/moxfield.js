function extractPublicId(input = '') {
  const raw = String(input).trim();
  try {
    const url = new URL(raw);
    if (['moxfield.com', 'www.moxfield.com'].includes(url.hostname) && url.protocol === 'https:') {
      return url.pathname.match(/^\/decks\/([A-Za-z0-9_-]{8,80})\/?$/)?.[1] || null;
    }
  } catch {}
  if (/^[A-Za-z0-9_-]{8,}$/.test(raw)) return raw;
  return null;
}

function cardFromEntry(key, entry = {}) {
  const card = entry.card || entry;
  const name = card.name || entry.name || key;
  const quantity = Number(entry.quantity || entry.count || card.quantity || 1);
  const set = card.set || card.set_code || entry.set || null;
  const collector_number = card.cn || card.collector_number || entry.cn || entry.collector_number || null;
  return name ? { name, quantity, set, collector_number } : null;
}

function normalizeBoard(board) {
  if (!board) return [];
  const source = board.cards || board;
  if (Array.isArray(source)) return source.map((entry, i) => cardFromEntry(String(i), entry)).filter(Boolean);
  return Object.entries(source).map(([key, entry]) => cardFromEntry(key, entry)).filter(Boolean);
}

function normalizeDeck(data) {
  const boards = data.boards || {};
  const main = normalizeBoard(boards.mainboard || data.mainboard);
  const commanders = normalizeBoard(boards.commanders || data.commanders);
  return {
    name: data.name || 'Imported Moxfield deck',
    commander: commanders[0]?.name || null,
    commanders,
    format: data.format || (commanders.length ? 'commander' : 'constructed'),
    cards: main,
    publicId: data.publicId || data.public_id || null,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const publicId = extractPublicId(req.query.url || req.query.id || '');
  if (!publicId) return res.status(400).json({ error: 'Enter a valid public Moxfield deck URL.' });

  const endpoints = [
    `https://api2.moxfield.com/v3/decks/all/${publicId}`,
    `https://api2.moxfield.com/v2/decks/all/${publicId}`,
    `https://api.moxfield.com/v2/decks/all/${publicId}`,
  ];
  const headers = {
    'Accept': 'application/json,text/plain,*/*',
    'User-Agent': 'MTGLine/1.0 (https://mtgline.vercel.app)',
    'Referer': `https://www.moxfield.com/decks/${publicId}`,
    'Origin': 'https://www.moxfield.com',
  };

  let lastStatus = null;
  for (const url of endpoints) {
    try {
      const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(8000) });
      lastStatus = response.status;
      if (!response.ok) continue;
      const text = await response.text();
      if (!text.trim().startsWith('{')) continue;
      const data = JSON.parse(text);
      const normalized = normalizeDeck(data);
      if (normalized.cards.length) return res.status(200).json(normalized);
    } catch (_) {}
  }

  return res.status(502).json({
    error: `Moxfield did not allow the public deck fetch${lastStatus ? ` (last response ${lastStatus})` : ''}`,
    fallback: 'Paste the exported decklist into the importer instead.'
  });
};
