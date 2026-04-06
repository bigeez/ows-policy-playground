'use strict';

const { randomBytes } = require('crypto');
const { redis, pipeline } = require('./_redis');

const MAX_BODY_BYTES  = 64 * 1024;       // 64 KB hard cap
const TTL_SECONDS     = 60 * 60 * 24 * 7; // 7-day expiry
const RATE_LIMIT      = 10;              // max saves per IP per minute
const RATE_WINDOW_SEC = 60;

const VALID_CHAIN_TYPES = new Set(['evm', 'solana', 'any']);
const VALID_RULE_NAMES  = new Set(['chains', 'expires', 'allowlist', 'spending']);

// ── CORS ────────────────────────────────────────────────────────────────────

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── State validation ─────────────────────────────────────────────────────────

/**
 * Returns an error string if `state` doesn't look like a valid playground state,
 * or null if it's acceptable.
 * Intentionally lenient — we only reject clearly malformed payloads.
 */
function validateState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return 'Expected a JSON object';
  }

  const strOrMissing = (v, name) =>
    v !== undefined && typeof v !== 'string' ? `${name} must be a string` : null;

  for (const field of ['policyId', 'policyName', 'wallet', 'keyName']) {
    const err = strOrMissing(state[field], field);
    if (err) return err;
  }

  if (state.rules !== undefined) {
    if (typeof state.rules !== 'object' || Array.isArray(state.rules)) {
      return 'rules must be an object';
    }

    for (const key of Object.keys(state.rules)) {
      if (!VALID_RULE_NAMES.has(key)) return `Unknown rule: ${key}`;
    }

    const { chains, expires, allowlist, spending } = state.rules;

    if (chains !== undefined) {
      if (typeof chains.on !== 'undefined' && typeof chains.on !== 'boolean')
        return 'chains.on must be boolean';
      if (chains.selected !== undefined && !Array.isArray(chains.selected))
        return 'chains.selected must be an array';
    }

    if (expires !== undefined) {
      if (typeof expires.on !== 'undefined' && typeof expires.on !== 'boolean')
        return 'expires.on must be boolean';
    }

    if (allowlist !== undefined) {
      if (typeof allowlist.on !== 'undefined' && typeof allowlist.on !== 'boolean')
        return 'allowlist.on must be boolean';
      if (allowlist.addrs !== undefined && !Array.isArray(allowlist.addrs))
        return 'allowlist.addrs must be an array';
      if (allowlist.type !== undefined && !VALID_CHAIN_TYPES.has(allowlist.type))
        return `allowlist.type must be one of: ${[...VALID_CHAIN_TYPES].join(', ')}`;
    }

    if (spending !== undefined) {
      if (typeof spending.on !== 'undefined' && typeof spending.on !== 'boolean')
        return 'spending.on must be boolean';
    }
  }

  return null;
}

// ── Rate limiting ────────────────────────────────────────────────────────────

/**
 * Returns true if the IP has exceeded the rate limit.
 * Uses an INCR + EXPIRE pipeline so the window key is created atomically.
 */
async function isRateLimited(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (forwarded ? forwarded.split(',')[0] : req.socket?.remoteAddress) || 'unknown';
  const minute = Math.floor(Date.now() / 1000 / RATE_WINDOW_SEC);
  const key = `ratelimit:save:${ip}:${minute}`;

  try {
    const [count] = await pipeline([
      ['INCR', key],
      ['EXPIRE', key, RATE_WINDOW_SEC, 'NX'], // NX: only set TTL on first write
    ]);
    return count > RATE_LIMIT;
  } catch (err) {
    // If rate-limit check fails, let the request through rather than hard-blocking.
    console.warn('[save] rate-limit check failed:', err.message);
    return false;
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  if (await isRateLimited(req)) {
    return res.status(429).json({ error: 'Too many requests — please wait a moment' });
  }

  const body = req.body;
  const validationError = validateState(body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const serialised = JSON.stringify({ savedAt: new Date().toISOString(), state: body });
  if (Buffer.byteLength(serialised, 'utf-8') > MAX_BODY_BYTES) {
    return res.status(413).json({ error: `Payload too large (max ${MAX_BODY_BYTES / 1024} KB)` });
  }

  const id = randomBytes(6).toString('hex'); // 12-char lowercase hex

  try {
    await redis('SET', `policy:${id}`, serialised, 'EX', TTL_SECONDS);

    const origin = req.headers.origin || `https://${req.headers.host || 'localhost'}`;
    res.status(200).json({ id, url: `${origin}/?id=${id}` });
  } catch (err) {
    console.error('[save]', err.message);
    res.status(500).json({ error: 'Failed to save policy' });
  }
};
