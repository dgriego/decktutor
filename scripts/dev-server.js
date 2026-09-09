'use strict';
// Serve the same API handlers locally, without needing Vercel credentials to use card-data coaching.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const staticFiles = new Set(['index.html', 'app.js', 'deck-core.js', 'hand-engine.js', 'styles.css', 'workflow.css', 'hover-preview.css', 'hover-preview.js', 'coach-readable.css']);
http.createServer(async (req, res) => {
  res.status = code => { res.statusCode = code; return res; };
  res.json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
  try {
    const url = new URL(req.url, 'http://localhost');
    if (['/api/analyze-deck', '/api/moxfield'].includes(url.pathname)) {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 65000) return res.status(413).json({ error: 'Request too large.' }); }
      req.body = body ? JSON.parse(body) : null;
      req.query = Object.fromEntries(url.searchParams);
      return await require(path.join(root, url.pathname + '.js'))(req, res);
    }
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!staticFiles.has(file)) return res.status(404).end('Not found');
    res.setHeader('Content-Type', mime[path.extname(file)] || 'text/plain');
    res.setHeader('Cache-Control', 'no-store');
    res.end(await fs.readFile(path.join(root, file)));
  } catch { res.status(500).json({ error: 'Local server error.' }); }
}).listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('MTGLine ready on http://localhost:' + (process.env.PORT || 3000)));
