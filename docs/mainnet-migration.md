# Mainnet Deployment Guide

This guide covers everything needed to safely deploy CosmosVote to Stellar mainnet.

> ⚠️ **Mainnet transactions are irreversible.** Work through every pre-deployment check before executing.
>
> **Prerequisite:** A successful dry-run on testnet is required before any mainnet deployment. Follow every section on testnet first using `config/testnet.toml`.

---

## 0. Testnet Dry-Run (Required Prerequisite)

Before touching mainnet, complete a full deployment on testnet and confirm:

- [ ] All smoke tests pass on testnet (Sections 5.2–5.4 below)
- [ ] Frontend connects to testnet contracts correctly
- [ ] Notification service delivers events on testnet
- [ ] Keeper service finalises proposals on testnet

Estimated time: **1–2 hours** including test proposal lifecycle.

Only proceed to mainnet after every item above is checked.

---

## 1. Pre-Deployment Checklist

### Code & Audit

*Estimated time: 30–60 minutes*

- [ ] All tests pass: `make test` (60+ tests, zero failures)
- [ ] No Clippy warnings: `make lint`
- [ ] Code is formatted: `make fmt`
- [ ] WASM builds cleanly: `make build`
- [ ] Verify WASM hash matches the audited binary (see [Section 3.1](#31-verify-wasm-hash-on-chain))
- [ ] Review [AUDIT.md](../AUDIT.md) — confirm scope and findings are addressed
- [ ] Review [docs/security/threat-model.md](./security/threat-model.md) — confirm mitigations are in place
- [ ] Review [docs/security/known-issues.md](./security/known-issues.md) — confirm all known issues are resolved or accepted
- [ ] Two maintainers have reviewed and approved this deployment plan

### Contract Audit Requirements

Before mainnet deployment, the contracts **must** be audited by a qualified third-party security firm. Minimum scope:

| Area | Requirement |
|------|------------|
| Authorization | Verify `require_auth()` on every state-changing function |
| Integer arithmetic | Confirm `checked_add` / `checked_sub` on all token math |
| Double-vote prevention | Confirm `HasVoted` flag is set atomically with the vote |
| Admin controls | Verify pause/unpause and admin-transfer logic |
| Re-entrancy | Confirm no cross-contract calls before state is committed |
| Storage exhaustion | Confirm TTL / bump strategies prevent storage expiry |

Document the audit report in `AUDIT.md` before proceeding.

### Admin Multisig Setup

*Estimated time: 30 minutes*

The contract admin should be a multisig account before mainnet deployment. See [docs/admin-multisig-pattern.md](./admin-multisig-pattern.md) for the full setup guide.

- [ ] Create a Stellar multisig account with at least 2-of-3 signers
- [ ] All signers are hardware wallets or HSMs — no plain secret key files on shared machines
- [ ] Test the multisig account by signing a testnet transaction with the required threshold
- [ ] Verify: `stellar account info <MULTISIG_ADDRESS> --network mainnet` shows the correct signer weights

```bash
# Verify multisig setup on mainnet
stellar account info <MULTISIG_ADDRESS> \
  --rpc-url https://soroban-mainnet.stellar.org \
  --network-passphrase "Public Global Stellar Network ; September 2015"
# Expected: signers array shows N signers, each with correct weight
```

### Infrastructure

*Estimated time: 15 minutes*

- [ ] Stellar account is funded with sufficient XLM for contract deployment and initialization
- [ ] Account is not a custodial/exchange address — you must control the secret key
- [ ] `STELLAR_SECRET_KEY` is stored in a secrets manager (not in `.env` on a shared machine)
- [ ] Deployment machine has Stellar CLI 22+ and Rust 1.75+ installed
- [ ] Monitoring and alerting is configured (see [docs/monitoring.md](./monitoring.md))

---

## 2. Configure `config/mainnet.toml`

The file at `config/mainnet.toml` holds the RPC endpoint and network passphrase:

```toml
rpc_url = "https://soroban-mainnet.stellar.org"
network_passphrase = "Public Global Stellar Network ; September 2015"
network = "mainnet"
```

You may point `rpc_url` at a private RPC node for higher reliability. The `network_passphrase` **must not** be changed — it is a consensus-level constant.

### Set `min_proposal_balance`

Choose a non-zero `MIN_PROPOSAL_BALANCE` to prevent proposal spam. The value is in token base units (7 decimal places, so `1000000 = 0.1 VOTE`).

```bash
# Recommended mainnet value: require at least 1 VOTE token (10_000_000 base units)
MIN_PROPOSAL_BALANCE=10000000
```

- [ ] `MIN_PROPOSAL_BALANCE` is set to a non-zero value in `config/mainnet.toml` and `.env`

### Environment Variables

Copy and populate the environment file:

```bash
cp .env.example .env
```

Key variables for mainnet:

| Variable | Description | Example |
|----------|-------------|---------|
| `NETWORK` | Target network | `mainnet` |
| `STELLAR_RPC_URL` | RPC endpoint | `https://soroban-mainnet.stellar.org` |
| `STELLAR_SECRET_KEY` | Deployer secret key (S…) | `SXXX…` |
| `INITIAL_TOKEN_SUPPLY` | Initial CVT supply (stroops) | `1000000000` |
| `MIN_PROPOSAL_BALANCE` | Min tokens to create a proposal | `10000000` |
| `PROPOSAL_COOLDOWN` | Seconds between proposals per address | `86400` |
| `RESTRICT_ADMIN_VOTE` | Prevent admin from voting | `true` |
| `CONCENTRATION_THRESHOLD_BPS` | Circuit breaker threshold in basis points | `5000` |

---

## 3. Build Release WASM Binaries

*Estimated time: 5–10 minutes*

```bash
rustup target add wasm32-unknown-unknown
make build
```

Verify the output files exist:

```bash
ls -lh target/wasm32-unknown-unknown/release/*.wasm
# cosmosvote_governance.wasm  ~50–80 KB
# cosmosvote_token.wasm       ~30–50 KB
```

### 3.1 Verify WASM Hash On-Chain

After upload (but before calling `initialize`), verify the WASM hash matches the audited binary. This guards against supply-chain tampering.

```bash
# Step 1: compute the expected hash of your local build
EXPECTED_HASH=$(sha256sum target/wasm32-unknown-unknown/release/cosmosvote_governance.wasm | awk '{print $1}')
echo "Expected WASM hash: $EXPECTED_HASH"

# Step 2: retrieve the hash of the uploaded WASM from the network
UPLOADED_HASH=$(stellar contract info --id "$GOVERNANCE_CONTRACT_ID" \
  --rpc-url https://soroban-mainnet.stellar.org \
  --network-passphrase "Public Global Stellar Network ; September 2015" \
  | jq -r '.wasm_hash')
echo "Uploaded WASM hash: $UPLOADED_HASH"

# Step 3: compare — they MUST match before proceeding
if [ "$EXPECTED_HASH" = "$UPLOADED_HASH" ]; then
  echo "✅ WASM hash verified"
else
  echo "❌ HASH MISMATCH — DO NOT PROCEED"
  exit 1
fi
```

- [ ] WASM hash has been verified and matches the audited binary

---

## 4. Deploy to Mainnet

*Estimated time: 10–15 minutes*

Run the deployment script. It will prompt for an explicit confirmation before sending any transactions:

```bash
./scripts/deploy_mainnet.sh
```

When prompted, type exactly:

```
deploy mainnet
```

The script will:
1. Build WASM (if not already built)
2. Deploy the token contract and call `initialize`
3. Deploy the governance contract and call `initialize` with `min_proposal_balance`, `concentration_threshold_bps`, and all other parameters
4. Print both contract IDs

Save the output:

```
TOKEN_CONTRACT_ID=C...
GOVERNANCE_CONTRACT_ID=C...
```

Add them to your `.env` and to any off-chain indexers or frontends.

### 4.1 Set `min_proposal_balance` via Initialization

The deployment script passes `MIN_PROPOSAL_BALANCE` from your environment. Confirm it was set correctly:

```bash
stellar contract invoke \
  --id $GOVERNANCE_CONTRACT_ID \
  --source $STELLAR_SECRET_KEY \
  --rpc-url https://soroban-mainnet.stellar.org \
  --network-passphrase "Public Global Stellar Network ; September 2015" \
  -- get_config
# Verify min_proposal_balance field in the response
```

- [ ] `min_proposal_balance` confirmed in contract config

---

## 5. Post-Deploy Verification

*Estimated time: 20–30 minutes*

Run every step below immediately after deployment. If any step fails, call `pause()` to halt active proposals and investigate before proceeding.

### 5.1 Verify Contract State

```bash
# Check governance is initialized
stellar contract invoke \
  --id $GOVERNANCE_CONTRACT_ID \
  --source $STELLAR_SECRET_KEY \
  --rpc-url https://soroban-mainnet.stellar.org \
  --network-passphrase "Public Global Stellar Network ; September 2015" \
  -- get_admin

# Check token supply
stellar contract invoke \
  --id $TOKEN_CONTRACT_ID \
  --source $STELLAR_SECRET_KEY \
  --rpc-url https://soroban-mainnet.stellar.org \
  --network-passphrase "Public Global Stellar Network ; September 2015" \
  -- total_supply
```

- [ ] `get_admin` returns the expected multisig admin address
- [ ] `total_supply` returns `INITIAL_TOKEN_SUPPLY`

### 5.2 Create a Smoke-Test Proposal

```bash
stellar contract invoke \
  --id $GOVERNANCE_CONTRACT_ID \
  --source $STELLAR_SECRET_KEY \
  --rpc-url https://soroban-mainnet.stellar.org \
  --network-passphrase "Public Global Stellar Network ; September 2015" \
  -- create_proposal \
  --proposer <ADMIN_ADDRESS> \
  --title "Mainnet smoke test" \
  --description "Verify governance contract is live on mainnet" \
  --quorum 1 \
  --duration 60
```

Expected output: a proposal ID (e.g., `0`).

- [ ] Proposal created successfully

### 5.3 Cast a Vote

```bash
stellar contract invoke \
  --id $GOVERNANCE_CONTRACT_ID \
  --source $STELLAR_SECRET_KEY \
  --rpc-url https://soroban-mainnet.stellar.org \
  --network-passphrase "Public Global Stellar Network ; September 2015" \
  -- cast_vote \
  --voter <ADMIN_ADDRESS> \
  --proposal_id 0 \
  --vote '{"tag":"Yes"}'
```

- [ ] Vote cast successfully, no errors returned

### 5.4 Finalize and Verify Outcome

After the duration elapses (for a 60-second test, wait 1 minute):

```bash
stellar contract invoke \
  --id $GOVERNANCE_CONTRACT_ID \
  --source $STELLAR_SECRET_KEY \
  --rpc-url https://soroban-mainnet.stellar.org \
  --network-passphrase "Public Global Stellar Network ; September 2015" \
  -- finalise \
  --proposal_id 0
```

Query the proposal state — it should be `Passed`:

```bash
stellar contract invoke \
  --id $GOVERNANCE_CONTRACT_ID \
  --source $STELLAR_SECRET_KEY \
  --rpc-url https://soroban-mainnet.stellar.org \
  --network-passphrase "Public Global Stellar Network ; September 2015" \
  -- get_proposal \
  --proposal_id 0
```

- [ ] Proposal state is `Passed`

### 5.5 Configure Monitoring

*Estimated time: 15 minutes*

- [ ] Start `scripts/admin_monitor.js` with `SLACK_WEBHOOK_URL` configured
- [ ] Start `scripts/monitor.js` for governance event alerting
- [ ] Verify at least one alert fires in the monitoring channel (use the smoke-test proposal above)
- [ ] Confirm Horizon event stream is indexed from the deployment ledger

See [docs/monitoring.md](./monitoring.md) for full monitoring setup instructions.

### 5.6 Update the Frontend

In `frontend/.env`:

```
VITE_GOVERNANCE_CONTRACT_ID=<GOVERNANCE_CONTRACT_ID>
VITE_TOKEN_CONTRACT_ID=<TOKEN_CONTRACT_ID>
VITE_NETWORK=mainnet
VITE_STELLAR_RPC_URL=https://soroban-mainnet.stellar.org
```

Rebuild and redeploy the frontend:

```bash
cd frontend && npm run build
```

- [ ] Frontend shows mainnet proposals correctly
- [ ] Wallet connects and shows correct network

---

## 6. Emergency Procedures

| Situation | Action |
|-----------|--------|
| Bug found post-deploy | Call `pause()` immediately to halt new proposals and votes |
| Admin key compromised | Call `transfer_admin()` from a backup key before attacker does |
| Stuck proposal | Admin can call `cancel()` on any active proposal |

See [SECURITY.md](../SECURITY.md) for the vulnerability disclosure policy.

---

## Deployment Checklist Summary

Use this condensed checklist at deploy time. Each item links back to the relevant section above.

### Phase 1 — Pre-Deployment

| # | Step | Est. Time | ✓ |
|---|------|-----------|---|
| 1 | Testnet dry-run completed | 1–2 h | [ ] |
| 2 | All tests pass (`make test`) | 5 min | [ ] |
| 3 | WASM builds cleanly (`make build`) | 5 min | [ ] |
| 4 | Audit findings resolved (AUDIT.md) | 30 min | [ ] |
| 5 | Admin multisig account configured | 30 min | [ ] |
| 6 | `MIN_PROPOSAL_BALANCE` set to non-zero | 5 min | [ ] |
| 7 | Two maintainers approved this plan | — | [ ] |
| 8 | `STELLAR_SECRET_KEY` in secrets manager | 10 min | [ ] |

### Phase 2 — Deployment

| # | Step | Est. Time | ✓ |
|---|------|-----------|---|
| 9 | Run `./scripts/deploy_mainnet.sh` | 10 min | [ ] |
| 10 | Save `TOKEN_CONTRACT_ID` and `GOVERNANCE_CONTRACT_ID` | 2 min | [ ] |
| 11 | Verify WASM hash matches audited binary (Section 3.1) | 5 min | [ ] |
| 12 | Verify `min_proposal_balance` in `get_config` | 2 min | [ ] |

### Phase 3 — Post-Deployment

| # | Step | Est. Time | ✓ |
|---|------|-----------|---|
| 13 | Smoke-test proposal created, voted, finalised | 10 min | [ ] |
| 14 | `get_admin` returns multisig address | 2 min | [ ] |
| 15 | Monitoring configured and alerting | 15 min | [ ] |
| 16 | Frontend updated and rebuilt | 10 min | [ ] |
| 17 | Notification service restarted with new contract IDs | 5 min | [ ] |

---

## Related Documents

- [Getting Started](./GETTING_STARTED.md)
- [Proposal Lifecycle](./lifecycle.md)
- [Storage Model](./storage.md)
- [Admin Multisig Pattern](./admin-multisig-pattern.md)
- [Monitoring](./monitoring.md)
- [Security Threat Model](./security/threat-model.md)
- [AUDIT.md](../AUDIT.md)
