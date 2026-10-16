# CosmosVote Operational Runbook

Common operational tasks for administrators of the CosmosVote governance contract.

**Prerequisites** — all commands require these environment variables:

```bash
export GOVERNANCE_CONTRACT_ID=<your-governance-contract-id>
export STELLAR_SECRET_KEY=<your-admin-secret-key>
export STELLAR_RPC_URL=<rpc-url>               # e.g. https://soroban-testnet.stellar.org
export NETWORK_PASSPHRASE="Test SDF Network ; September 2015"  # or mainnet passphrase
```

---

## 1. Pause the Contract

Stops all state-changing operations (create proposal, cast vote, finalize, execute, cancel). Use during incidents or upgrades.

```bash
stellar contract invoke \
  --id "$GOVERNANCE_CONTRACT_ID" \
  --source "$STELLAR_SECRET_KEY" \
  --rpc-url "$STELLAR_RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- pause \
  --admin "$(stellar keys address "$STELLAR_SECRET_KEY")"
```

**Verify:** any non-read call should return error `40 ContractPaused`.

---

## 2. Unpause the Contract

Resumes normal operations after a pause.

```bash
stellar contract invoke \
  --id "$GOVERNANCE_CONTRACT_ID" \
  --source "$STELLAR_SECRET_KEY" \
  --rpc-url "$STELLAR_RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- unpause \
  --admin "$(stellar keys address "$STELLAR_SECRET_KEY")"
```

---

## 3. Update Quorum on an Active Proposal

Adjusts the quorum threshold on a proposal that is still **Active and has received zero votes**.

```bash
stellar contract invoke \
  --id "$GOVERNANCE_CONTRACT_ID" \
  --source "$STELLAR_SECRET_KEY" \
  --rpc-url "$STELLAR_RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- update_quorum \
  --admin "$(stellar keys address "$STELLAR_SECRET_KEY")" \
  --proposal_id <PROPOSAL_ID> \
  --new_quorum <NEW_QUORUM>
```

Replace `<PROPOSAL_ID>` with the target proposal's numeric ID and `<NEW_QUORUM>` with the new minimum vote-weight threshold (must be > 0 and ≤ total token supply).

---

## 4. Transfer Admin (Two-Step)

Admin transfer is a two-step process to prevent accidental loss of admin access.

**Step 1 — current admin initiates the transfer:**

```bash
stellar contract invoke \
  --id "$GOVERNANCE_CONTRACT_ID" \
  --source "$STELLAR_SECRET_KEY" \
  --rpc-url "$STELLAR_RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- transfer_admin \
  --admin "$(stellar keys address "$STELLAR_SECRET_KEY")" \
  --new_admin <NEW_ADMIN_ADDRESS>
```

**Step 2 — new admin accepts** (signed by the new admin's key):

```bash
stellar contract invoke \
  --id "$GOVERNANCE_CONTRACT_ID" \
  --source "$NEW_ADMIN_SECRET_KEY" \
  --rpc-url "$STELLAR_RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- accept_admin \
  --pending_admin <NEW_ADMIN_ADDRESS>
```

The transfer is only complete after Step 2. Until then, the original admin retains control.

---

## 5. Deploy a New Contract Version

```bash
# 1. Build the updated WASM
cargo build --release --target wasm32-unknown-unknown

# 2. Deploy new token contract (if changed)
NEW_TOKEN_ID=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/cosmosvote_token.wasm \
  --source "$STELLAR_SECRET_KEY" \
  --rpc-url "$STELLAR_RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE")

# 3. Deploy new governance contract
NEW_GOV_ID=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/cosmosvote_governance.wasm \
  --source "$STELLAR_SECRET_KEY" \
  --rpc-url "$STELLAR_RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE")

# 4. Initialize governance
ADMIN_ADDRESS=$(stellar keys address "$STELLAR_SECRET_KEY")
stellar contract invoke \
  --id "$NEW_GOV_ID" \
  --source "$STELLAR_SECRET_KEY" \
  --rpc-url "$STELLAR_RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- initialize \
  --admin "$ADMIN_ADDRESS" \
  --voting_token "$NEW_TOKEN_ID" \
  --min_proposal_balance 0 \
  --proposal_cooldown 0 \
  --restrict_admin_vote false

echo "New governance contract: $NEW_GOV_ID"
```

Update `GOVERNANCE_CONTRACT_ID` and `TOKEN_CONTRACT_ID` in your `.env` file after deployment. Pause the old contract before cutting over.

---

## Troubleshooting

| Error | Code | Cause | Fix |
|-------|------|-------|-----|
| `ContractPaused` | 40 | Contract is paused | Run `unpause` first |
| `NotPaused` | 41 | Calling `unpause` on an already-active contract | No action needed |
| `NotAdmin` | 30 | `--source` key is not the current admin | Use the correct admin key |
| `NoPendingAdmin` | — | Calling `accept_admin` with no pending transfer | Run `transfer_admin` first |
| `NotPendingAdmin` | — | `accept_admin` caller does not match pending admin | Use the exact address set in `transfer_admin` |
| `ProposalNotFound` | 10 | Invalid `--proposal_id` | Verify the proposal ID exists |
| `ProposalNotActive` | 11 | `update_quorum` called on a non-Active proposal | Only active proposals can be updated |
| `QuorumUpdateNotAllowed` | — | Proposal already has votes | Quorum can only be changed before any votes are cast |
| `QuorumExceedsSupply` | 16 | `new_quorum` > total token supply | Lower the quorum value |
| `AlreadyInitialized` | 1 | `initialize` called on an already-initialized contract | Deploy a fresh contract instead |

For the full error reference see [docs/errors.md](./errors.md).

---

## Deployment Procedure

Use this section when deploying CosmosVote contracts to testnet or mainnet for the first time, or when upgrading to a new version.

### Pre-Flight Checks

Complete every item before running any deployment script.

- [ ] **Environment variables set** — all required vars are exported:
  ```bash
  echo "$GOVERNANCE_CONTRACT_ID" "$TOKEN_CONTRACT_ID" "$STELLAR_SECRET_KEY" \
       "$STELLAR_RPC_URL" "$NETWORK_PASSPHRASE"
  ```
  None of the above should be blank.
- [ ] **Tests passing** — the full test suite is green:
  ```bash
  make test
  ```
- [ ] **Backup taken** — export the current contract state (proposal IDs, quorum settings, admin address) and save it off-chain before any upgrade:
  ```bash
  stellar contract invoke --id "$GOVERNANCE_CONTRACT_ID" \
    --rpc-url "$STELLAR_RPC_URL" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    -- get_config
  ```
- [ ] **Quorum config verified** — confirm `min_quorum_bps` and per-proposal quorums are correct for this network (testnet vs. mainnet values differ).
- [ ] **Old contract paused** (upgrades only) — pause the existing contract before deploying the replacement (see [Section 1](#1-pause-the-contract)).

### Step-by-Step Deployment

1. **Build WASM binaries:**
   ```bash
   make build
   # Artifacts: target/wasm32-unknown-unknown/release/cosmosvote_governance.wasm
   #            target/wasm32-unknown-unknown/release/cosmosvote_token.wasm
   ```

2. **Run the deployment script:**
   - Testnet / local:
     ```bash
     bash scripts/deploy.sh
     ```
   - Mainnet:
     ```bash
     bash scripts/deploy_mainnet.sh
     ```
   Both scripts print the new `CONTRACT_ID` values on success.

3. **Record the new contract IDs** returned by the script and update `.env`:
   ```bash
   GOVERNANCE_CONTRACT_ID=<new-gov-id>
   TOKEN_CONTRACT_ID=<new-token-id>
   ```

4. **Initialize the governance contract** (fresh deploy only — skip for upgrades that reuse an existing instance):
   ```bash
   stellar contract invoke \
     --id "$GOVERNANCE_CONTRACT_ID" \
     --source "$STELLAR_SECRET_KEY" \
     --rpc-url "$STELLAR_RPC_URL" \
     --network-passphrase "$NETWORK_PASSPHRASE" \
     -- initialize \
     --admin "$(stellar keys address "$STELLAR_SECRET_KEY")" \
     --voting_token "$TOKEN_CONTRACT_ID" \
     --min_proposal_balance 0 \
     --proposal_cooldown 0 \
     --min_quorum_bps <BPS> \
     --restrict_admin_vote false
   ```

5. **Unpause** (upgrades only — if old contract was paused in pre-flight):
   ```bash
   # Unpause the NEW contract if it was deployed in paused state
   # (fresh deploys are unpaused by default)
   ```

6. **Verify WASM build integrity** using the test script:
   ```bash
   bash scripts/test_wasm.sh
   ```

### Post-Flight Checks

Perform these checks immediately after deployment completes.

- [ ] **Health check** — confirm the contract responds to a read call:
  ```bash
  stellar contract invoke \
    --id "$GOVERNANCE_CONTRACT_ID" \
    --rpc-url "$STELLAR_RPC_URL" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    -- get_config
  ```
  Expected: returns the config struct without error.
- [ ] **Event emission test** — create a test proposal and verify an `proposal_created` event appears in the Horizon event stream:
  ```bash
  stellar events --network testnet \
    --contract-id "$GOVERNANCE_CONTRACT_ID" \
    --start-ledger <DEPLOY_LEDGER>
  ```
- [ ] **Active proposals still accessible** (upgrades only) — query each known active proposal ID and confirm status is still `Active`:
  ```bash
  stellar contract invoke \
    --id "$GOVERNANCE_CONTRACT_ID" \
    --rpc-url "$STELLAR_RPC_URL" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    -- get_proposal --proposal_id <ID>
  ```
- [ ] **Frontend connected** — update `VITE_GOVERNANCE_CONTRACT_ID` and `VITE_TOKEN_CONTRACT_ID` in `frontend/.env`, restart the dev server, and confirm proposals load.
- [ ] **Notification service updated** — restart the notification service with the new contract ID so it resumes event polling from the correct ledger.


---

## Incident Response

This section documents the response procedures for the three most likely production incidents. Each playbook includes step-by-step actions, an owner assignment, and SLA targets.

> **Escalation contacts**
>
> | Role | Contact | Availability |
> |------|---------|-------------|
> | On-call maintainer | See private oncall roster (internal) | 24/7 for P0/P1 |
> | Security lead | joymercy7879@gmail.com | Within 24 h |
> | Stellar Foundation support | https://stellar.org/developers | Business hours |
>
> **SLA targets**
>
> | Severity | First response | Mitigation | Full resolution |
> |----------|---------------|------------|-----------------|
> | P0 (critical — funds at risk) | 1 hour | 4 hours | 24 hours |
> | P1 (high — service degraded) | 4 hours | 24 hours | 72 hours |
> | P2 (medium — partial impact) | 24 hours | 72 hours | 7 days |

---

### IR-1 — Admin Key Compromise

**Trigger:** Evidence that the admin private key (or the deployer wallet seed phrase) has been exposed, leaked in a repository, or used by an unauthorized party.

**Severity:** P0

**Owner:** Security lead + on-call maintainer

#### Detection Signals

- Unexpected `transfer_admin`, `pause`, or `cancel` transactions on-chain that the admin did not initiate.
- Admin key found in a public git repository, Slack message, or log file.
- Wallet seed phrase or `.env` file accidentally committed.

#### Step-by-Step Response

| # | Action | Owner | Command / Notes |
|---|--------|-------|-----------------|
| 1 | **Pause the contract immediately** using any remaining admin access. | On-call | `stellar contract invoke ... -- pause --admin <ADMIN_ADDR>` (see [Section 1](#1-pause-the-contract)) |
| 2 | **Revoke the compromised key** from all CI/CD secrets, GitHub Actions, and server environments. | Security lead | GitHub → Settings → Secrets. Remove and rotate. |
| 3 | **Generate a new admin keypair** on an air-gapped machine. Never store the seed phrase in plaintext. | Security lead | `stellar keys generate new-admin --network testnet` |
| 4 | **Initiate two-step admin transfer** to the new keypair using the compromised key — if it still has access. | On-call + Security lead | See [Section 4 — Transfer Admin](#4-transfer-admin-two-step). Accept with the new key. |
| 5 | **If the compromised key can no longer transfer admin**, treat this as a total admin loss incident and redeploy (see IR-2). | Security lead | — |
| 6 | **Audit on-chain history** for unauthorized transactions during the window of compromise. Export all events from the deployment ledger. | On-call | `stellar events --network mainnet --contract-id $GOVERNANCE_CONTRACT_ID --start-ledger <DEPLOY_LEDGER>` |
| 7 | **Assess proposal state.** Cancel any proposals that may have been created or manipulated by the attacker. | Security lead | `-- cancel --admin <NEW_ADMIN> --proposal_id <ID>` |
| 8 | **Unpause the contract** once the new admin is in place and the audit is complete. | On-call | `-- unpause --admin <NEW_ADMIN_ADDR>` |
| 9 | **Notify the community** via the project's communication channel (Discord, forum, etc.) with a timeline and impact summary. | Security lead | — |
| 10 | **Write a postmortem** using the template in [docs/postmortem-template.md](./postmortem-template.md). | On-call | Due within 48 h of resolution. |

#### Prevention

- Never commit `.env` files; use `.gitignore` and CI/CD secret management.
- Use hardware wallets or HSMs for mainnet admin keys.
- Enable multi-signature via the admin multisig pattern: [docs/admin-multisig-pattern.md](./admin-multisig-pattern.md).
- Rotate keys on a scheduled basis (annually at minimum).

---

### IR-2 — Critical Contract Bug

**Trigger:** Discovery of a bug in the governance or token contract that could lead to incorrect vote tallying, unauthorized fund disbursement, re-initialization, or any other loss of integrity.

**Severity:** P0 (funds at risk or vote integrity compromised) / P1 (logic error with no immediate fund risk)

**Owner:** On-call maintainer + Security lead

#### Detection Signals

- A security researcher or user reports unexpected contract behavior.
- CI fuzz testing uncovers a panic or arithmetic overflow path.
- On-chain monitoring alerts fire for anomalous event sequences.
- A `finalise` call produces a result inconsistent with the vote record.

#### Step-by-Step Response

| # | Action | Owner | Command / Notes |
|---|--------|-------|-----------------|
| 1 | **Pause the contract immediately** to halt all state-changing operations. | On-call | `-- pause --admin <ADMIN_ADDR>` |
| 2 | **Triage the bug** — reproduce locally with a unit test. Determine which functions are affected and whether funds are at risk. | On-call | `cargo test -p cosmosvote-governance -- <test_name>` |
| 3 | **Classify severity.** If funds can be drained or votes manipulated, treat as P0 and escalate immediately. | Security lead | — |
| 4 | **Preserve all affected proposal and vote state** off-chain before any further action. | On-call | `stellar contract invoke ... -- get_proposal --proposal_id <ID>` for each active proposal. |
| 5 | **Develop a fix** in a private branch. Do not push to main until the fix is verified. | On-call | Follow the standard development workflow in [CONTRIBUTING.md](../CONTRIBUTING.md). |
| 6 | **Run the full test suite** including fuzz and property-based tests. | On-call | `make test && cargo test prop_` |
| 7 | **Deploy the patched contract** to testnet and run integration tests. | On-call | `bash scripts/deploy.sh` (testnet), then `make test-integration` |
| 8 | **Deploy to mainnet** after testnet validation. Keep the old contract paused until the new one is live. | On-call + Security lead | `bash scripts/deploy_mainnet.sh` |
| 9 | **Migrate active proposals** if necessary. Cancelled proposals cannot be restored; coordinate with affected proposers. | Security lead | — |
| 10 | **Unpause the new contract** and verify with post-flight checks. | On-call | See [Post-Flight Checks](#post-flight-checks) |
| 11 | **Publish a security advisory** on GitHub and notify users via the community channel. | Security lead | GitHub → Security → Advisories |
| 12 | **Write a postmortem** using [docs/postmortem-template.md](./postmortem-template.md). | On-call | Due within 48 h of resolution. |

#### Notes

- Soroban contracts are **not upgradeable in place**; a fix requires deploying a new contract and migrating state.
- The treasury contract is independent — if only the treasury has a bug, only it needs redeployment.
- See [docs/security/threat-model.md](./security/threat-model.md) for the full threat model and known limitations.

---

### IR-3 — Denial of Service Against RPC

**Trigger:** The Soroban RPC endpoint used by the frontend and notification service becomes unavailable or extremely slow, preventing users from reading proposals or submitting votes.

**Severity:** P1

**Owner:** On-call maintainer

#### Detection Signals

- Monitoring alert fires for RPC response time > 10 s or HTTP 5xx rate > 10%.
- Users report that proposals are not loading or transactions are not confirming.
- The notification service logs repeated `fetch` failures or timeouts.

#### Step-by-Step Response

| # | Action | Owner | Command / Notes |
|---|--------|-------|-----------------|
| 1 | **Confirm the outage** by testing the RPC endpoint directly. | On-call | `curl -X POST "$STELLAR_RPC_URL" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'` Expected: `{"status":"healthy"}` |
| 2 | **Check the Stellar status page** for network-wide incidents. | On-call | https://stellarstatus.com |
| 3 | **Switch to a backup RPC endpoint.** Update `STELLAR_RPC_URL` / `VITE_STELLAR_RPC_URL` in the deployment environment. | On-call | Public endpoints: `https://soroban-testnet.stellar.org` (testnet), `https://soroban-mainnet.stellar.org` (mainnet). Alternatively, run a self-hosted RPC node. |
| 4 | **Restart the frontend** with the new endpoint and verify proposals load. | On-call | `npm run build && npm run preview` (or redeploy to CDN) |
| 5 | **Restart the notification service** with the updated `STELLAR_RPC_URL`. | On-call | `docker compose restart notification` or equivalent |
| 6 | **Restart the keeper service** so finalization continues. | On-call | `docker compose restart keeper` |
| 7 | **Monitor for recovery.** Once the primary endpoint is restored, optionally switch back. | On-call | Re-run health check from step 1. |
| 8 | **Notify users** if the outage lasted more than 15 minutes. Post a status update in the community channel. | On-call | — |
| 9 | **Document the incident** — log start time, end time, root cause (if known), and the RPC endpoint switched to. | On-call | Append to [docs/postmortem-template.md](./postmortem-template.md) or open a GitHub issue. |

#### Prevention

- Configure at least two RPC endpoints in the deployment and implement automatic failover.
- Set up uptime monitoring with alerts for the primary RPC endpoint (see [docs/monitoring.md](./monitoring.md)).
- Run a dedicated Soroban RPC node for mainnet if uptime SLAs are critical.

---

### Incident Response Quick Reference

| Scenario | First action | Key doc |
|----------|-------------|---------|
| Admin key compromised | Pause the contract | IR-1 above |
| Critical contract bug | Pause the contract | IR-2 above |
| RPC unavailable | Switch to backup endpoint | IR-3 above |
| Unknown / multi-vector | Pause the contract as a precaution | See [Section 1](#1-pause-the-contract) |

For all P0 incidents, open a private GitHub security advisory immediately:
**GitHub repo → Security → Advisories → New draft advisory.**

See also: [docs/security/threat-model.md](./security/threat-model.md) | [SECURITY.md](../SECURITY.md)
