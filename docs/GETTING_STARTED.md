# Getting Started with CosmosVote

This guide walks you through setting up CosmosVote from scratch.

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Rust | 1.75+ | [rustup.rs](https://rustup.rs) |
| Stellar CLI | 22+ | [stellar.org/cli](https://stellar.org/cli) |
| Docker | Any | [docker.com](https://docker.com) (optional) |

## Step 1 — Clone & Build

```bash
git clone https://github.com/mercyJJ/cosmosvote.git
cd cosmosvote
rustup target add wasm32-unknown-unknown
make build
```

## Step 2 — Run Tests

```bash
make test
```

All 60+ tests should pass.

## Step 3 — Configure Environment

```bash
cp .env.example .env
# Edit .env: set STELLAR_SECRET_KEY and NETWORK
```

## Step 4 — Deploy to Testnet

```bash
NETWORK=testnet ./scripts/deploy.sh
```

Copy the printed contract IDs into your `.env`.

## Step 5 — Interact with Contracts

```bash
# Create a proposal
stellar contract invoke \
  --id $GOVERNANCE_CONTRACT_ID \
  --source $STELLAR_SECRET_KEY \
  --network testnet \
  -- create_proposal \
  --proposer <YOUR_ADDRESS> \
  --title "My First Proposal" \
  --description "A test governance proposal" \
  --quorum 1000000 \
  --duration 3600

# Cast a vote
stellar contract invoke \
  --id $GOVERNANCE_CONTRACT_ID \
  --source $STELLAR_SECRET_KEY \
  --network testnet \
  -- cast_vote \
  --voter <YOUR_ADDRESS> \
  --proposal_id 0 \
  --vote '{"tag":"Yes"}'
```

## Step 6 — Run the Frontend

The frontend is a React + Vite application that allows you to browse proposals.

```bash
cd frontend
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and set:
# VITE_GOVERNANCE_CONTRACT_ID="CB..."
# VITE_TOKEN_CONTRACT_ID="CD..."
# VITE_RPC_URL="http://localhost:8000" (or testnet URL)

# 3. Start development server
npm run dev
# Open http://localhost:5173
```

### Frontend Configuration

| Variable | Description |
|----------|-------------|
| `VITE_GOVERNANCE_CONTRACT_ID` | The ID of the deployed governance contract |
| `VITE_TOKEN_CONTRACT_ID` | The ID of the deployed token contract |
| `VITE_RPC_URL` | The Soroban RPC endpoint (local, testnet, or mainnet) |
| `VITE_NETWORK_PASSPHRASE` | Network passphrase for signing transactions |


## Next Steps

- Read the [Proposal Lifecycle](./lifecycle.md)
- Review the [Storage Model](./storage.md)
- Check the [Error Reference](./errors.md)
- Browse [Architecture Decision Records](./adr/)

## Promotion Workflow: local → testnet → mainnet

Changes must follow this promotion path before reaching mainnet:

```
local  →  testnet (staging)  →  mainnet
```

### Step 1 — Validate locally

```bash
docker compose up
docker compose run --rm dev make test
```

### Step 2 — Deploy to testnet (staging)

```bash
STELLAR_SECRET_KEY=<testnet-key> ./scripts/deploy_testnet.sh
```

Record the printed SHA-256 WASM hashes. The CI `testnet-gate` workflow runs this automatically on every push to `main`.

### Step 3 — Promote to mainnet

Only after testnet smoke tests pass:

```bash
# Dry-run first to preview all commands
./scripts/deploy_mainnet.sh --dry-run

# Deploy with hash verification
./scripts/deploy_mainnet.sh \
  --expected-token-hash <sha256-from-testnet> \
  --expected-gov-hash   <sha256-from-testnet>
```

Use `--yes` to skip the interactive prompt in automated pipelines.

### CI gate

The `.github/workflows/testnet-gate.yml` workflow deploys to testnet and runs smoke tests on every merge to `main`. Mainnet deployments are always manual and require the WASM hashes printed by the testnet deployment.
