[README.md](https://github.com/user-attachments/files/26470841/README.md)
# OWS Policy Playground

> A visual no-code policy builder for the [Open Wallet Standard](https://openwallet.sh) policy engine.

**[→ Live Demo](https://bigeez.github.io/ows-policy-playground)**

Built for the [OWS Hackathon](https://hackathon.openwallet.sh) — April 3, 2026.

---

## The Problem

The OWS policy engine is powerful — spending limits, chain restrictions, address allowlists, time-bound access. But right now, you have to write policy JSON by hand and figure out the CLI commands yourself. There's no visual feedback, no way to test a transaction before you deploy, and no quick way to understand what your policy will actually do.

That's friction. Especially for developers new to OWS, or anyone building agent-powered wallets who wants to iterate fast.

## The Solution

OWS Policy Playground is a single-file, zero-dependency web app that lets you:

- **Build policies visually** — toggle rules on/off, pick chains from a grid, add addresses, set spending caps and expiry dates
- **See the output instantly** — live syntax-highlighted JSON that matches the OWS policy file format exactly
- **Get the CLI commands** — auto-generated `ows policy create` and `ows key create` commands ready to copy-paste
- **Simulate transactions** — paste a recipient, value, and chain, and see which rules PASS or FAIL before any key is touched
- **Start fast with presets** — AI Agent, DeFi Bot, Multi-Chain, and Read-Only presets autofill everything

No install. No backend. Open the HTML file and go.

---

## Features

### Policy Builder
- `allowed_chains` — pick from all OWS-supported CAIP-2 chain IDs (EVM, Solana, Bitcoin, Cosmos, Tron, TON)
- `expires_at` — datetime picker for time-bound agent access
- `address_allowlist` — add/remove recipient addresses with allowlist type (EVM / Solana / any)
- `spending_limit` — daily cap and per-transaction cap in ETH

### Live JSON Output
- Generates a valid OWS policy file (`policy.json`) in real time
- Generates the exact `ows` CLI commands to deploy it
- One-click copy for both

### Transaction Simulator
- Input chain, recipient address, transaction value, and current daily spend
- Evaluates every active rule and shows individual PASS / FAIL per rule
- Displays the full `PolicyContext` object — exactly what OWS sends to your executable policy

### Presets
| Preset | Rules |
|---|---|
| 🤖 AI Agent | Base only · 30-day expiry · 0.5 ETH daily / 0.1 ETH per-tx |
| 🔒 Read-Only | No chains allowed — denies all signing |
| 🌐 Multi-Chain | Ethereum + Base + Polygon + Solana |
| ⚡ DeFi Bot | Base only · contract allowlist · 2 ETH daily / 0.5 ETH per-tx · 1-year expiry |

---

## OWS Policy Spec Covered

This tool implements the declarative and executable rule types from [OWS Policy Engine spec (doc 03)](https://github.com/open-wallet-standard/core/blob/main/docs/03-policy-engine.md):

- `allowed_chains` — declarative, in-process
- `expires_at` — declarative, in-process
- `address_allowlist` — executable policy pattern
- `spending_limit` — executable policy pattern with `PolicyContext.spending`

The generated JSON matches the exact policy file format:

```json
{
  "id": "base-agent-policy",
  "name": "Base AI Agent Safety Limits",
  "version": 1,
  "created_at": "2026-04-03T20:00:00Z",
  "rules": [
    { "type": "allowed_chains", "chain_ids": ["eip155:8453"] },
    { "type": "expires_at", "timestamp": "2026-05-03T00:00:00Z" }
  ],
  "executable": "~/.ows/plugins/policies/spending-limit",
  "config": {
    "daily_limit_eth": "0.5",
    "per_tx_limit_eth": "0.1"
  },
  "action": "deny"
}
```

---

## Usage

**Option 1 — Live:**
Open [bigeez.github.io/ows-policy-playground](https://bigeez.github.io/ows-policy-playground) in your browser.

**Option 2 — Local:**
```bash
git clone https://github.com/bigeez/ows-policy-playground
cd ows-policy-playground
open index.html
```

No build step. No npm install. Just open the file.

---

## Stack

- Vanilla HTML / CSS / JavaScript — single file, zero dependencies
- Fonts: Syne + Geist Mono via Google Fonts
- Works in any modern browser

---

## Why This Matters for Agent Wallets

OWS is designed for a world where AI agents sign transactions autonomously. The policy engine is what keeps that safe — it's the last line of defense before a key is touched. But a policy engine is only as good as the policies people actually write.

This tool removes the barrier. Anyone building an agent on OWS can now configure, preview, and validate their signing policy in minutes — without reading the full spec or hand-crafting JSON.

---

## License

MIT

---

Built by [@bigeez](https://github.com/bigeez) for the OWS Hackathon · April 3, 2026
