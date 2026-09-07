# Contract State Inspection

_Relates to issue [#383](https://github.com/mercyJJ/cosmosvote/issues/383)._

---

## Overview

The `scripts/inspect-state.js` CLI tool lets developers query live CosmosVote
contract storage during testing and troubleshooting. It uses the Stellar CLI
(`stellar contract invoke`) to call read-only contract functions and prints
results in a readable table or raw JSON.

---

## Prerequisites

- Node.js 20+
- [Stellar CLI](https://developers.stellar.org/docs/tools/stellar-cli) installed and on `PATH`
- A running Soroban RPC endpoint (local, testnet, or mainnet)

---

## Setup

```bash
# From the repo root
cp .env.example .env
# Edit .env and set:
#   STELLAR_RPC_URL=https://soroban-testnet.stellar.org
#   GOVERNANCE_CONTRACT_ID=<your-contract-id>
```

Or pass values directly via flags (see below).

---

## Usage

```
node scripts/inspect-state.js [command] [options]
```

### Commands

| Command | Description |
|---------|-------------|
| `config` | Show admin settings (admin address, paused state, quorum floor, etc.) |
| `proposals [--limit N]` | List last N proposals (default: 10) |
| `proposal <id>` | Show a single proposal in detail |
| `votes <id>` | Show vote tallies (yes / no / abstain) for a proposal |
| `all` | Show config + all proposals |

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--rpc-url <url>` | Soroban RPC endpoint | `STELLAR_RPC_URL` env or testnet |
| `--contract-id <id>` | Governance contract address | `GOVERNANCE_CONTRACT_ID` env |
| `--network <testnet\|mainnet>` | Network shorthand (sets default RPC URL) | `testnet` |
| `--limit N` | Number of proposals to fetch | `10` |
| `--json` | Output raw JSON instead of formatted text | off |

---

## Examples

```bash
# Show admin settings
node scripts/inspect-state.js config

# List last 5 proposals
node scripts/inspect-state.js proposals --limit 5

# Inspect proposal #3
node scripts/inspect-state.js proposal 3

# Check votes on proposal #7
node scripts/inspect-state.js votes 7

# Dump everything as JSON (useful for scripting)
node scripts/inspect-state.js all --json > state.json

# Point at a specific RPC and contract
node scripts/inspect-state.js config \
  --rpc-url https://soroban-testnet.stellar.org \
  --contract-id GABCDEF...
```

---

## Sample Output

```
=== Admin Settings ===
  Admin address       : GABC...1234
  Voting token        : GDEF...5678
  Paused              : false
  Proposal count      : 7
  Active proposals    : 2
  Min proposal balance: 0
  Proposal cooldown   : 0s
  Restrict admin vote : false

=== Proposals (7) ===

  Proposal #6
    Title       : Increase quorum floor to 5%
    State       : Active
    Proposer    : GABC...1234
    Quorum      : 5000000
    Votes Yes   : 3200000  No: 1100000  Abstain: 500000  Total: 4800000
    Voters      : 12
    Start/End   : 1751000000 / 1751003600
    Description : Raise the minimum quorum from 1% to 5% to ensure wider…
```

---

## Troubleshooting

**`GOVERNANCE_CONTRACT_ID is not set`**
Set it in `.env` or pass `--contract-id <id>`.

**`RPC call failed`**
Check that `STELLAR_RPC_URL` points to a live RPC node and the contract is
deployed on that network.

**`stellar: command not found`**
Install the Stellar CLI: https://developers.stellar.org/docs/tools/stellar-cli
