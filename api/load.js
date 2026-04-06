'use strict';

const { redis } = require('./_redis');

// Exactly 12 lowercase hex chars — prevents any path/key injection
const ID_RE = /^[0-9a-f]{12}$/;

// ── CORS ────────────────────────────────────────────────────────────────────

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Handler ──────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  if (!id || !ID_RE.test(id)) {
    return res.status(400).json({ error: 'Invalid or missing policy ID' });
  }

  try {
    const raw = await redis('GET', `policy:${id}`);

    if (raw === null) {
      return res.status(404).json({ error: 'Policy not found or expired' });
    }

    const file  = JSON.parse(raw);
    const state = file.state ?? file; // backwards-compat with old filesystem saves

    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.status(200).json(state);
  } catch (err) {
    console.error('[load]', err.message);
    res.status(500).json({ error: 'Failed to load policy' });
  }
};
