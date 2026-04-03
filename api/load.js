'use strict';

// Exactly 12 lowercase hex chars — prevents any path/key injection
const ID_RE = /^[0-9a-f]{12}$/;

async function redisGet(key) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set');

  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Upstash GET failed: ${res.status} ${text}`);
  }

  const { result } = await res.json();
  return result; // null when key doesn't exist or has expired
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || !ID_RE.test(id)) {
    return res.status(400).json({ error: 'Invalid or missing policy ID' });
  }

  try {
    const raw = await redisGet(`policy:${id}`);

    if (raw === null) {
      return res.status(404).json({ error: 'Policy not found or expired' });
    }

    const file  = JSON.parse(raw);
    const state = file.state ?? file; // backwards-compat with old filesystem saves

    res.status(200).json(state);
  } catch (err) {
    console.error('[load]', err.message);
    res.status(500).json({ error: 'Failed to load policy' });
  }
};
