'use strict';

function credentials() {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set');
  return { url, token };
}

/**
 * Execute a single Redis command via the Upstash REST API.
 * Returns the `result` field from the response JSON.
 */
async function redis(...args) {
  const { url, token } = credentials();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Redis ${args[0]} failed: ${res.status} ${text}`);
  }
  return (await res.json()).result;
}

/**
 * Execute multiple Redis commands atomically via the Upstash pipeline endpoint.
 * Returns an array of `result` values, one per command.
 */
async function pipeline(commands) {
  const { url, token } = credentials();
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Redis pipeline failed: ${res.status} ${text}`);
  }
  return (await res.json()).map(r => r.result);
}

module.exports = { redis, pipeline };
