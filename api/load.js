'use strict';

const { readFileSync } = require('fs');
const { join }         = require('path');

// Only accept exactly 12 lowercase hex chars — prevents path traversal
const ID_RE = /^[0-9a-f]{12}$/;

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable'); // policies are immutable

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;

  if (!id || !ID_RE.test(id)) {
    return res.status(400).json({ error: 'Invalid or missing policy ID' });
  }

  const filePath = join(process.cwd(), 'api', 'policies', `${id}.json`);

  try {
    const raw  = readFileSync(filePath, 'utf-8');
    const file = JSON.parse(raw);

    // Support both old format (raw state) and new format ({ savedAt, state })
    const state = file.state ?? file;

    res.status(200).json(state);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Policy not found' });
    }
    console.error('[load]', err);
    res.status(500).json({ error: 'Failed to read policy' });
  }
};
