const { readFileSync } = require('fs');
const { join } = require('path');

module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;

  if (!id || !/^[a-f0-9]{12}$/i.test(id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  const filePath = join(process.cwd(), 'api', 'policies', id + '.json');

  try {
    const data = readFileSync(filePath, 'utf-8');
    res.status(200).json(JSON.parse(data));
  } catch (err) {
    res.status(404).json({ error: 'Policy not found' });
  }
};
