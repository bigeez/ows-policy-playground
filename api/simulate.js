'use strict';

const VALID_RULE_NAMES = new Set(['chains', 'expires', 'allowlist', 'spending']);

// ── CORS ─────────────────────────────────────────────────────────────────────

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Input validation ──────────────────────────────────────────────────────────

function validateRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Expected a JSON object';
  }

  const { policy, transaction } = body;

  // transaction
  if (!transaction || typeof transaction !== 'object' || Array.isArray(transaction)) {
    return 'transaction is required and must be an object';
  }
  if (typeof transaction.chain !== 'string' || !transaction.chain.trim()) {
    return 'transaction.chain must be a non-empty string';
  }
  if (transaction.to !== undefined && transaction.to !== null && typeof transaction.to !== 'string') {
    return 'transaction.to must be a string or null';
  }
  if (transaction.value !== undefined) {
    const v = Number(transaction.value);
    if (isNaN(v) || v < 0) return 'transaction.value must be a non-negative number';
  }
  if (transaction.dailySpent !== undefined) {
    const v = Number(transaction.dailySpent);
    if (isNaN(v) || v < 0) return 'transaction.dailySpent must be a non-negative number';
  }
  if (transaction.timestamp !== undefined && isNaN(Date.parse(transaction.timestamp))) {
    return 'transaction.timestamp must be a valid ISO date string';
  }

  // policy
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return 'policy is required and must be an object';
  }
  if (policy.rules !== undefined) {
    if (typeof policy.rules !== 'object' || Array.isArray(policy.rules)) {
      return 'policy.rules must be an object';
    }
    for (const key of Object.keys(policy.rules)) {
      if (!VALID_RULE_NAMES.has(key)) return `Unknown rule: "${key}"`;
    }
  }

  return null;
}

// ── Simulation engine ─────────────────────────────────────────────────────────

function simulate(policy, transaction) {
  const rules      = policy.rules || {};
  const chain      = transaction.chain;
  const to         = transaction.to || null;
  const value      = Number(transaction.value)      || 0;
  const dailySpent = Number(transaction.dailySpent) || 0;
  const now        = transaction.timestamp ? new Date(transaction.timestamp) : new Date();

  const checks = [];
  let denied = false;

  const deny = (rule, message) => { checks.push({ rule, pass: false, message }); denied = true; };
  const pass = (rule, message) =>   checks.push({ rule, pass: true,  message });

  // ── allowed_chains ──────────────────────────────────────────────────────────
  if (rules.chains?.on) {
    const selected = Array.isArray(rules.chains.selected) ? rules.chains.selected : [];
    if (selected.length === 0) {
      deny('allowed_chains', 'No chains configured — all transactions denied');
    } else if (!selected.includes(chain)) {
      deny('allowed_chains', `"${chain}" is not in the allowed list`);
    } else {
      pass('allowed_chains', `"${chain}" is allowed`);
    }
  }

  // ── expires_at ──────────────────────────────────────────────────────────────
  if (rules.expires?.on && rules.expires.value) {
    const expiry = new Date(rules.expires.value);
    if (isNaN(expiry.getTime())) {
      deny('expires_at', 'Invalid expiry date in policy');
    } else if (now > expiry) {
      deny('expires_at', `Policy expired at ${expiry.toISOString()}`);
    } else {
      const hoursLeft = Math.round((expiry - now) / 3_600_000);
      pass('expires_at', `Valid for ${hoursLeft}h more`);
    }
  }

  // ── address_allowlist ───────────────────────────────────────────────────────
  if (rules.allowlist?.on) {
    const addrs = Array.isArray(rules.allowlist.addrs) ? rules.allowlist.addrs : [];
    if (addrs.length === 0) {
      deny('address_allowlist', 'Allowlist is empty — all transactions denied');
    } else if (!to) {
      deny('address_allowlist', 'No recipient address provided');
    } else if (!addrs.some(a => a.toLowerCase() === to.toLowerCase())) {
      const preview = to.length > 12 ? `${to.slice(0, 10)}…` : to;
      deny('address_allowlist', `"${preview}" is not in the allowlist`);
    } else {
      pass('address_allowlist', 'Recipient is allowlisted');
    }
  }

  // ── spending_limit ──────────────────────────────────────────────────────────
  if (rules.spending?.on) {
    const dailyCap = parseFloat(rules.spending.daily) || 1.0;
    const perTxCap = parseFloat(rules.spending.perTx) || 0.25;

    if (value > perTxCap) {
      deny('spending_limit', `${value} ETH exceeds per-tx cap of ${perTxCap} ETH`);
    } else {
      pass('spending_limit', `${value} ETH ≤ per-tx cap of ${perTxCap} ETH`);
      const newTotal = dailySpent + value;
      if (newTotal > dailyCap) {
        deny('spending_limit', `Daily total ${newTotal.toFixed(4)} ETH would exceed ${dailyCap} ETH cap`);
      } else {
        pass('spending_limit', `Daily total ${newTotal.toFixed(4)} / ${dailyCap} ETH`);
      }
    }
  }

  if (checks.length === 0) {
    pass('(no rules)', 'No active rules — transaction allowed (owner mode)');
  }

  return { allowed: !denied, checks };
}

// ── Handler ──────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const error = validateRequest(req.body);
  if (error) return res.status(400).json({ error });

  try {
    const result = simulate(req.body.policy, req.body.transaction);
    res.status(200).json(result);
  } catch (err) {
    console.error('[simulate]', err.message);
    res.status(500).json({ error: 'Simulation failed' });
  }
};
