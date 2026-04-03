'use strict';

const { randomBytes } = require('crypto');

const MAX_BODY_BYTES = 64 * 1024;      // 64 KB hard cap
const TTL_SECONDS    = 60 * 60 * 24 * 7; // 7-day expiry

async function redisSet(key, value, ttl) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(['SET', key, value, 'EX', ttl]),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Upstash SET failed: ${res.status} ${text}`);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Expected a JSON object body' });
  }

  const serialised = JSON.stringify({ savedAt: new Date().toISOString(), state: body });
  if (Buffer.byteLength(serialised, 'utf-8') > MAX_BODY_BYTES) {
    return res.status(413).json({ error: `Payload too large (max ${MAX_BODY_BYTES / 1024} KB)` });
  }

  const id = randomBytes(6).toString('hex'); // 12-char lowercase hex

  try {
    await redisSet(`policy:${id}`, serialised, TTL_SECONDS);

    const origin = req.headers.origin || `https://${req.headers.host || 'localhost'}`;
    res.status(200).json({ id, url: `${origin}/?id=${id}` });
  } catch (err) {
    console.error('[save]', err.message);
    res.status(500).json({ error: 'Failed to save policy' });
  }
};
