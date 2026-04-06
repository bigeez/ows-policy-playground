'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const CHAINS = [
  { id: 'eip155:1',       label: 'Ethereum'     },
  { id: 'eip155:8453',    label: 'Base'          },
  { id: 'eip155:137',     label: 'Polygon'       },
  { id: 'eip155:42161',   label: 'Arbitrum'      },
  { id: 'eip155:10',      label: 'Optimism'      },
  { id: 'eip155:56',      label: 'BSC'           },
  { id: 'solana:5eykt',   label: 'Solana'        },
  { id: 'bip122:000',     label: 'Bitcoin'       },
  { id: 'cosmos:cosmoshub', label: 'Cosmos'      },
  { id: 'tron:mainnet',   label: 'Tron'          },
  { id: 'ton:mainnet',    label: 'TON'           },
  { id: 'eip155:84532',   label: 'Base Testnet'  },
];

const RULE_NAMES = ['chains', 'expires', 'allowlist', 'spending'];

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────

const defaultState = () => ({
  policyId: '',
  policyName: '',
  rules: {
    chains:    { on: false, selected: [] },
    expires:   { on: false, value: '' },
    allowlist: { on: false, addrs: [], type: 'evm' },
    spending:  { on: false, daily: '', perTx: '' },
  },
  wallet: '',
  keyName: '',
});

let state = defaultState();

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

/** Escape HTML to safely insert user content into innerHTML. */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(id, ms = 2200) {
  const el = $(id);
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), ms);
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

const Validators = {
  evmAddress:    s => /^0x[0-9a-fA-F]{40}$/.test(s),
  solanaAddress: s => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s),
  policyId:      s => /^[a-z0-9][a-z0-9\-_]*$/i.test(s),
  ethAmount:     s => s !== '' && !isNaN(parseFloat(s)) && parseFloat(s) >= 0,
};

function validateAddress(addr, type) {
  if (type === 'evm')    return Validators.evmAddress(addr);
  if (type === 'solana') return Validators.solanaAddress(addr);
  return addr.length > 0;
}

function addressFormatHint(type) {
  if (type === 'evm')    return 'EVM addresses must be 0x + 40 hex chars';
  if (type === 'solana') return 'Solana addresses must be 32–44 base58 chars';
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE COLLECTION
// ─────────────────────────────────────────────────────────────────────────────

function collectState() {
  state.policyId            = $('policyId').value.trim()   || 'my-policy';
  state.policyName          = $('policyName').value.trim() || 'My Policy';
  state.rules.expires.value = $('expiresAt').value;
  state.rules.spending.daily = $('dailyLimit').value.trim();
  state.rules.spending.perTx = $('perTxLimit').value.trim();
  state.rules.allowlist.type = $('allowlistType').value;
  state.wallet   = $('walletScope').value.trim() || 'my-wallet';
  state.keyName  = $('keyName').value.trim()     || 'my-agent';
}

// ─────────────────────────────────────────────────────────────────────────────
// POLICY BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildPolicyJSON() {
  collectState();
  const r = state.rules;
  const declarativeRules = [];
  const execPlugins = [];

  if (r.chains.on && r.chains.selected.length > 0) {
    declarativeRules.push({ type: 'allowed_chains', chain_ids: [...r.chains.selected] });
  }
  if (r.expires.on && r.expires.value) {
    declarativeRules.push({ type: 'expires_at', timestamp: new Date(r.expires.value).toISOString() });
  }
  if (r.allowlist.on && r.allowlist.addrs.length > 0) {
    execPlugins.push({
      path: '~/.ows/plugins/policies/address-allowlist',
      config: { addresses: [...r.allowlist.addrs], chain_type: r.allowlist.type },
    });
  }
  if (r.spending.on) {
    execPlugins.push({
      path: '~/.ows/plugins/policies/spending-limit',
      config: {
        daily_limit_eth:  r.spending.daily || '1.0',
        per_tx_limit_eth: r.spending.perTx || '0.25',
      },
    });
  }

  // Resolve executable: single plugin, composite wrapper, or null
  let executable = null;
  let config = null;
  if (execPlugins.length === 1) {
    executable = execPlugins[0].path;
    config     = execPlugins[0].config;
  } else if (execPlugins.length > 1) {
    executable = '~/.ows/plugins/policies/composite';
    config     = { plugins: execPlugins };
  }

  return {
    id:         state.policyId,
    name:       state.policyName,
    version:    1,
    created_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    rules:      declarativeRules,
    executable,
    config,
    action:     'deny',
  };
}

function buildOWSCommands() {
  collectState();
  return [
    '# 1. Save policy to disk',
    `ows policy create --file ${state.policyId}.json`,
    '',
    '# 2. Create an API key scoped to this policy',
    'ows key create \\',
    `  --name "${state.keyName}" \\`,
    `  --wallet ${state.wallet} \\`,
    `  --policy ${state.policyId}`,
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNTAX HIGHLIGHTER  (token-based, XSS-safe)
//
// Tokenises the HTML-escaped JSON character-by-character so that:
//  • String values are never re-processed by later passes.
//  • User input can never inject HTML (esc() runs first).
//  • Keys are distinguished from values via a colon lookahead.
// ─────────────────────────────────────────────────────────────────────────────

function syntaxHL(json) {
  const src = esc(json);   // HTML-safe source; " → &quot;
  let out = '';
  let pos = 0;

  const peek = str => src.startsWith(str, pos);
  const eat  = n   => { const s = src.slice(pos, pos + n); pos += n; return s; };

  while (pos < src.length) {
    if (peek('&quot;')) {
      // ── JSON string token ────────────────────────────────────────────────
      const start = pos;
      pos += 6;  // opening &quot;

      while (pos < src.length && !peek('&quot;')) {
        // handle \" inside a string (appears as \&quot; after esc())
        if (peek('\\&quot;')) pos += 7;
        else                  pos += 1;
      }
      pos += 6;  // closing &quot;

      const token = src.slice(start, pos);

      // Lookahead: key if next non-space char is ':'
      let la = pos;
      while (la < src.length && src[la] === ' ') la++;
      out += src[la] === ':'
        ? `<span class="json-key">${token}</span>`
        : `<span class="json-string">${token}</span>`;

    } else if (peek('true'))  { out += '<span class="json-bool">true</span>';   pos += 4; }
    else if (peek('false')) { out += '<span class="json-bool">false</span>';  pos += 5; }
    else if (peek('null'))  { out += '<span class="json-null">null</span>';   pos += 4; }
    else if (src[pos] === '-' || /\d/.test(src[pos])) {
      // ── Number ────────────────────────────────────────────────────────────
      const start = pos;
      if (src[pos] === '-') pos++;
      while (pos < src.length && /[\d.eE+\-]/.test(src[pos])) pos++;
      out += `<span class="json-number">${src.slice(start, pos)}</span>`;
    } else if (':{}[],'.includes(src[pos])) {
      out += `<span class="json-punct">${src[pos]}</span>`;
      pos++;
    } else {
      out += src[pos++];
    }
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// POLICY WARNINGS
// ─────────────────────────────────────────────────────────────────────────────

function buildWarnings() {
  const r = state.rules;
  const warnings = [];

  if (r.chains.on && r.chains.selected.length === 0)
    warnings.push('allowed_chains is enabled but no chains are selected — every transaction will be denied.');

  if (r.allowlist.on && r.allowlist.addrs.length === 0)
    warnings.push('address_allowlist is enabled but empty — every transaction will be denied.');

  if (r.spending.on) {
    const daily = parseFloat(r.spending.daily);
    const perTx = parseFloat(r.spending.perTx);
    if (r.spending.daily && isNaN(daily))
      warnings.push('Daily limit is not a valid number.');
    if (r.spending.perTx && isNaN(perTx))
      warnings.push('Per-tx limit is not a valid number.');
    if (!isNaN(daily) && !isNaN(perTx) && perTx > daily)
      warnings.push(`Per-tx limit (${perTx} ETH) exceeds daily limit (${daily} ETH) — no single transaction can succeed.`);
  }

  return warnings;
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER (main output panel)
// ─────────────────────────────────────────────────────────────────────────────

function render() {
  const policy = buildPolicyJSON();
  const json   = JSON.stringify(policy, null, 2);
  const cmd    = buildOWSCommands();

  const warningHtml = buildWarnings()
    .map(w => `<div class="policy-warning">⚠ ${esc(w)}</div>`)
    .join('');

  $('jsonOutput').innerHTML =
    warningHtml +
    '<div class="json-section-label">policy.json</div>' +
    `<pre class="json-pre">${syntaxHL(json)}</pre>` +
    '<div class="json-section-label">ows commands</div>' +
    `<pre class="json-pre json-cmd">${esc(cmd)}</pre>`;

  const count = RULE_NAMES.filter(n => state.rules[n].on).length;
  $('activeRuleCount').textContent = `${count} rule${count !== 1 ? 's' : ''} active`;

  renderSim();
}

const debouncedRender = debounce(render, 80);

// ─────────────────────────────────────────────────────────────────────────────
// ADDRESS LIST
// ─────────────────────────────────────────────────────────────────────────────

function renderAddrList() {
  const list = $('addrList');
  const type = state.rules.allowlist.type;
  list.innerHTML = '';

  state.rules.allowlist.addrs.forEach((addr, i) => {
    const valid = validateAddress(addr, type);
    const item  = document.createElement('div');
    item.className = 'addr-item fade-in' + (valid ? '' : ' addr-invalid');
    item.innerHTML =
      `<span class="addr-text" title="${esc(addr)}">${esc(addr)}</span>` +
      (!valid ? `<span class="addr-warn" title="${esc(addressFormatHint(type))}">⚠</span>` : '') +
      `<span class="addr-remove" data-idx="${i}" title="Remove">&#x2715;</span>`;
    list.appendChild(item);
  });
}

function addAddr() {
  const inp   = $('addrInput');
  const errEl = $('addrError');
  const val   = inp.value.trim();
  if (!val) return;

  const type    = $('allowlistType').value;
  const isValid = validateAddress(val, type);

  if (!isValid && type !== 'any') {
    errEl.textContent = addressFormatHint(type) + ' — added with warning.';
    setTimeout(() => { errEl.textContent = ''; }, 3500);
  } else {
    errEl.textContent = '';
  }

  state.rules.allowlist.addrs.push(val);
  inp.value = '';
  renderAddrList();
  render();
}

function removeAddr(idx) {
  state.rules.allowlist.addrs.splice(idx, 1);
  renderAddrList();
  render();
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE TOGGLES
// ─────────────────────────────────────────────────────────────────────────────

function toggleRule(name) {
  $(`body-${name}`).classList.toggle('open');
}

function toggleRuleOn(name) {
  const on = !state.rules[name].on;
  state.rules[name].on = on;
  $(`toggle-${name}`).classList.toggle('on', on);
  $(`card-${name}`).classList.toggle('active', on);
  if (on) $(`body-${name}`).classList.add('open');
  render();
}

function toggleChain(id) {
  const arr = state.rules.chains.selected;
  const idx = arr.indexOf(id);
  if (idx === -1) arr.push(id); else arr.splice(idx, 1);

  $$('.chain-chip').forEach(chip => {
    if (chip.dataset.chain === id)
      chip.classList.toggle('selected', arr.includes(id));
  });
  render();
}

// ─────────────────────────────────────────────────────────────────────────────
// COPY
// ─────────────────────────────────────────────────────────────────────────────

function copyJSON() {
  navigator.clipboard.writeText(JSON.stringify(buildPolicyJSON(), null, 2));
  showToast('copyToast');
}

function copyOWSCommand() {
  navigator.clipboard.writeText(buildOWSCommands());
  showToast('copyToast');
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARE / LOAD
// ─────────────────────────────────────────────────────────────────────────────

async function sharePolicy() {
  collectState();
  const btn = $('shareBtn');
  btn.textContent = '...';
  btn.disabled = true;

  try {
    const res  = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    navigator.clipboard.writeText(data.url);
    history.replaceState(null, '', `/?id=${data.id}`);
    showToast('shareToast');
  } catch (e) {
    alert(`Share failed: ${e.message}`);
  } finally {
    btn.textContent = '↗ share';
    btn.disabled = false;
  }
}

async function loadFromUrl() {
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) return;

  try {
    const res = await fetch(`/api/load?id=${encodeURIComponent(id)}`);
    if (!res.ok) return;
    restoreState(await res.json());
  } catch (e) {
    console.error('Failed to load shared policy:', e);
  }
}

function restoreState(saved) {
  if (!saved || typeof saved !== 'object') return;

  // Deep-merge with defaults so old saves with missing keys don't crash
  state = defaultState();
  if (saved.policyId)   state.policyId   = saved.policyId;
  if (saved.policyName) state.policyName = saved.policyName;
  if (saved.wallet)     state.wallet     = saved.wallet;
  if (saved.keyName)    state.keyName    = saved.keyName;

  const savedRules = saved.rules || {};
  RULE_NAMES.forEach(name => {
    const src = savedRules[name];
    if (!src) return;
    Object.assign(state.rules[name], src);
  });

  // Restore inputs
  $('policyId').value    = state.policyId;
  $('policyName').value  = state.policyName;
  $('walletScope').value = state.wallet;
  $('keyName').value     = state.keyName;

  // Restore rule toggle UI
  RULE_NAMES.forEach(name => {
    const on = !!state.rules[name].on;
    $(`toggle-${name}`).classList.toggle('on', on);
    $(`card-${name}`).classList.toggle('active', on);
    $(`body-${name}`).classList.toggle('open', on);
  });

  // Restore chain chips
  $$('.chain-chip').forEach(chip => {
    chip.classList.toggle('selected',
      state.rules.chains.selected.includes(chip.dataset.chain));
  });

  // Restore rule-specific inputs
  if (state.rules.expires.value) $('expiresAt').value = state.rules.expires.value;
  $('allowlistType').value = state.rules.allowlist.type || 'evm';
  $('dailyLimit').value    = state.rules.spending.daily || '';
  $('perTxLimit').value    = state.rules.spending.perTx || '';

  renderAddrList();
  render();
}

// ─────────────────────────────────────────────────────────────────────────────
// RESET
// ─────────────────────────────────────────────────────────────────────────────

function resetAll() {
  state = defaultState();

  ['policyId','policyName','expiresAt','dailyLimit','perTxLimit','walletScope','keyName','addrInput']
    .forEach(id => { const el = $(id); if (el) el.value = ''; });

  RULE_NAMES.forEach(name => {
    $(`toggle-${name}`).classList.remove('on');
    $(`card-${name}`).classList.remove('active');
    $(`body-${name}`).classList.remove('open');
  });

  $$('.chain-chip').forEach(c => c.classList.remove('selected'));
  $('addrList').innerHTML = '';
  $('simResult').className = 'sim-result';
  $('allowlistType').value = 'evm';

  if (window.location.search) history.replaceState(null, '', '/');

  render();
}

// ─────────────────────────────────────────────────────────────────────────────
// PRE-SIGN SIMULATOR
// ─────────────────────────────────────────────────────────────────────────────

async function runSim() {
  collectState();

  const btn = $('runSimBtn');
  btn.disabled    = true;
  btn.textContent = '…';

  const transaction = {
    chain:      $('simChain').value,
    to:         $('simTo').value.trim() || null,
    value:      parseFloat($('simValue').value)      || 0,
    dailySpent: parseFloat($('simDailySpent').value) || 0,
    timestamp:  $('simTimestamp').value || undefined,
  };

  try {
    const res  = await fetch('/api/simulate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ policy: { rules: state.rules }, transaction }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    renderSimResult(data);
  } catch (err) {
    console.error('[runSim]', err);
    renderSimResult({
      allowed: false,
      checks:  [{ rule: 'error', pass: false, message: err.message }],
    });
  } finally {
    btn.disabled    = false;
    btn.textContent = '▶ run simulation';
  }
}

function renderSimResult({ allowed, checks }) {
  const result   = $('simResult');
  const verdict  = $('simVerdict');
  const checksEl = $('simChecks');

  result.className  = `sim-result show fade-in ${allowed ? 'pass' : 'fail'}`;
  verdict.className = `sim-verdict ${allowed ? 'pass' : 'fail'}`;
  verdict.innerHTML = allowed ? '✓ &nbsp;ALLOWED' : '✗ &nbsp;DENIED';

  checksEl.innerHTML = '';
  checks.forEach(c => {
    const el = document.createElement('div');
    el.className = `sim-check ${c.pass ? 'pass' : 'fail'}`;
    el.innerHTML =
      `<span class="sim-check-icon">${c.pass ? '✓' : '✗'}</span>` +
      `<span>${esc(c.rule ? `${c.rule}: ` : '')}${esc(c.message)}</span>`;
    checksEl.appendChild(el);
  });
}

function renderSim() {
  collectState();
  const chain      = $('simChain').value;
  const to         = $('simTo').value.trim();
  const value      = $('simValue').value.trim();
  const dailySpent = $('simDailySpent').value.trim();
  const timestamp  = $('simTimestamp').value;

  const toWei = v => v ? '0x' + Math.round(parseFloat(v) * 1e18).toString(16) : '0x0';

  const ctx = {
    chain_id:   chain,
    wallet_id:  state.wallet || 'my-wallet',
    api_key_id: '<derived-from-token>',
    transaction: {
      to:      to || null,
      value:   toWei(value),
      raw_hex: '0x02f8…',
      data:    '0x',
    },
    spending: {
      daily_total: toWei(dailySpent),
      date: timestamp ? timestamp.slice(0, 10) : new Date().toISOString().slice(0, 10),
    },
    timestamp: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
  };

  $('ctxPreview').innerHTML =
    `<pre class="json-pre" style="font-size:0.68rem; margin:0;">${syntaxHL(JSON.stringify(ctx, null, 2))}</pre>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRESETS
// ─────────────────────────────────────────────────────────────────────────────

function applyPreset(name) {
  resetAll();

  const enableRule = (ruleName) => {
    state.rules[ruleName].on = true;
    $(`toggle-${ruleName}`).classList.add('on');
    $(`card-${ruleName}`).classList.add('active');
    $(`body-${ruleName}`).classList.add('open');
  };

  const selectChains = (ids) => {
    enableRule('chains');
    state.rules.chains.selected = ids;
    $$('.chain-chip').forEach(c =>
      c.classList.toggle('selected', ids.includes(c.dataset.chain)));
  };

  const setExpires = (days) => {
    enableRule('expires');
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    const val = d.toISOString().slice(0, 16);
    $('expiresAt').value = val;
    state.rules.expires.value = val;
  };

  const setSpending = (daily, perTx) => {
    enableRule('spending');
    $('dailyLimit').value = daily;
    $('perTxLimit').value = perTx;
  };

  const setAllowlist = (addrs) => {
    enableRule('allowlist');
    state.rules.allowlist.addrs = addrs;
    renderAddrList();
  };

  const setMeta = (id, name, wallet, key) => {
    $('policyId').value    = id;
    $('policyName').value  = name;
    $('walletScope').value = wallet;
    $('keyName').value     = key;
  };

  if (name === 'agent') {
    setMeta('base-agent-policy', 'Base AI Agent Safety Limits', 'agent-treasury', 'claude-agent');
    selectChains(['eip155:8453', 'eip155:84532']);
    setExpires(30);
    setSpending('0.5', '0.1');

  } else if (name === 'readonly') {
    setMeta('read-only', 'Read-Only Access', 'my-wallet', 'readonly-agent');
    selectChains([]); // empty = deny all signing

  } else if (name === 'multichain') {
    setMeta('multichain-agent', 'Multi-Chain Agent Policy', 'multi-wallet', 'multichain-bot');
    selectChains(['eip155:1', 'eip155:8453', 'eip155:137', 'solana:5eykt']);

  } else if (name === 'defi') {
    setMeta('defi-bot-policy', 'DeFi Bot Limits', 'defi-treasury', 'defi-agent');
    selectChains(['eip155:8453']);
    setAllowlist([
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      '0x4200000000000000000000000000000000000006',
    ]);
    setSpending('2.0', '0.5');
    setExpires(365);
  }

  render();
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAIN GRID
// ─────────────────────────────────────────────────────────────────────────────

function buildChainGrid() {
  const grid = $('chainGrid');
  grid.innerHTML = '';
  CHAINS.forEach(c => {
    const chip = document.createElement('div');
    chip.className    = 'chain-chip';
    chip.dataset.chain = c.id;
    chip.innerHTML    = `<div class="chain-dot"></div><span>${esc(c.label)}</span>`;
    chip.addEventListener('click', () => toggleChain(c.id));
    grid.appendChild(chip);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────────────────────────────────────────

function attachListeners() {
  // Preset buttons
  $$('[data-preset]').forEach(btn =>
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset)));

  // Rule card headers — click toggle (expand/collapse) or toggle-on (enable/disable)
  $$('.rule-card-header').forEach(header => {
    header.addEventListener('click', e => {
      const toggleEl = e.target.closest('[data-rule-toggle]');
      if (toggleEl) {
        e.stopPropagation();
        toggleRuleOn(toggleEl.dataset.ruleToggle);
      } else {
        toggleRule(header.dataset.rule);
      }
    });
  });

  // Text inputs → debounced render
  ['policyId', 'policyName', 'expiresAt', 'dailyLimit', 'perTxLimit', 'walletScope', 'keyName']
    .forEach(id => $(id).addEventListener('input', debouncedRender));

  // Allowlist type change → re-validate existing addresses + re-render
  $('allowlistType').addEventListener('change', () => { renderAddrList(); render(); });

  // Address add
  $('addrAddBtn').addEventListener('click', addAddr);
  $('addrInput').addEventListener('keydown', e => { if (e.key === 'Enter') addAddr(); });

  // Address remove (event delegation)
  $('addrList').addEventListener('click', e => {
    const btn = e.target.closest('[data-idx]');
    if (btn) removeAddr(parseInt(btn.dataset.idx, 10));
  });

  // Simulator inputs → live PolicyContext preview
  ['simChain', 'simTo', 'simValue', 'simDailySpent', 'simTimestamp'].forEach(id => {
    $(id).addEventListener('input',  renderSim);
    $(id).addEventListener('change', renderSim);
  });

  // Toolbar
  $('copyJsonBtn').addEventListener('click', copyJSON);
  $('copyOWSBtn').addEventListener('click',  copyOWSCommand);
  $('shareBtn').addEventListener('click',    sharePolicy);
  $('runSimBtn').addEventListener('click',   runSim);
  $('resetBtn').addEventListener('click',    resetAll);

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod || !e.shiftKey) return;
    if (e.key === 'S') { e.preventDefault(); sharePolicy(); }
    if (e.key === 'C') { e.preventDefault(); copyJSON(); }
    if (e.key === 'R') { e.preventDefault(); resetAll(); }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────

function init() {
  buildChainGrid();

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  $('simTimestamp').value = now.toISOString().slice(0, 16);

  attachListeners();
  render();
  renderSim();
  loadFromUrl();
}

document.addEventListener('DOMContentLoaded', init);
