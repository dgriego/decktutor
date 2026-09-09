'use strict';

async function gatewayToken() {
  if (process.env.AI_GATEWAY_API_KEY) return process.env.AI_GATEWAY_API_KEY;
  try {
    const { getVercelOidcToken } = await import('@vercel/functions/oidc');
    return await getVercelOidcToken();
  } catch {
    return process.env.VERCEL_OIDC_TOKEN || null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'POST only' }); }
  const token = await gatewayToken();
  if (!token) return res.status(503).json({ error: 'Gateway authentication is unavailable.' });
  try {
    const response = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-5.4', messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 16 }),
      signal: AbortSignal.timeout(30000)
    });
    let providerType = '';
    if (!response.ok) {
      try { providerType = String((await response.json())?.error?.type || '').slice(0, 80); } catch { /* Keep provider response private. */ }
    }
    return res.status(200).json({ gatewayStatus: response.status, providerType, ok: response.ok });
  } catch {
    return res.status(200).json({ gatewayStatus: 0, providerType: 'network_error', ok: false });
  }
};
