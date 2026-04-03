'use strict';

const { writeFileSync, mkdirSync } = require('fs');
const { join }                     = require('path');
const { randomBytes }              = require('crypto');

const MAX_BODY_BYTES = 64 * 1024; // 64 KB — reject oversized payloads

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Expected a JSON object body' });
  }

  // Reject payloads that are unreasonably large
  const bodySize = Buffer.byteLength(JSON.stringify(body), 'utf-8');
  if (bodySize > MAX_BODY_BYTES) {
    return res.status(413).json({ error: `Payload too large (max ${MAX_BODY_BYTES / 1024} KB)` });
  }

  const id  = randomBytes(6).toString('hex'); // 12-char hex, URL-safe
  const dir = join(process.cwd(), 'api', 'policies');

  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `${id}.json`),
      JSON.stringify({ savedAt: new Date().toISOString(), state: body }, null, 2),
      'utf-8',
    );

    const origin = req.headers.origin || `https://${req.headers.host || 'localhost'}`;
    res.status(200).json({ id, url: `${origin}/?id=${id}` });
  } catch (err) {
    console.error('[save]', err);
    res.status(500).json({ error: 'Failed to save policy' });
  }
};
