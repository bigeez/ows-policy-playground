const { writeFileSync, mkdirSync } = require('fs');
const { join } = require('path');
const { randomUUID } = require('crypto');

module.exports = function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid body' });
  }

  const id = randomUUID().replace(/-/g, '').slice(0, 12);
  const dir = join(process.cwd(), 'api', 'policies');

  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, id + '.json'), JSON.stringify(body, null, 2), 'utf-8');

    const origin = req.headers.origin || ('https://' + (req.headers.host || 'localhost'));
    const url = origin + '/?id=' + id;

    res.status(200).json({ id, url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
