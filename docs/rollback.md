# Rollback Procedure

This document explains how to recover from a failed or bad CosmosVote deployment,
including the automated rollback triggered by the
[Deploy and Verify workflow](.github/workflows/deploy-and-verify.yml).

## Important limitation

Soroban smart contracts are **immutable once deployed**. A rollback does not remove or modify on-chain contracts. It restores the *contract ID references* in your environment (`.env`) so your application points back to the previously known-good contracts.

---

## Automated rollback via GitHub Actions

The `deploy-and-verify.yml` workflow automates the deploy → verify → rollback cycle
for every push to `main` that touches `frontend/`, `infra/terraform/`, or
`scripts/deploy_mainnet.sh`.

### Workflow overview

```
deploy job
  ├── captures previous version (contract IDs + build artifact) before deploying
  └── health-check job (waits 30 s for CloudFront propagation, runs scripts/health_check.sh)
        ├── [PASS] → workflow succeeds, no rollback
        └── [FAIL] → rollback job triggers automatically
                        ├── runs scripts/rollback.sh --latest
                        ├── invalidates CloudFront cache
                        ├── uploads log artifact (retained 30 days)
                        └── incident-report job posts Slack/webhook alert
```

### Previous-version capture

Before any new artifact is deployed, the `deploy` job records the currently
live version so the rollback job has a known-good target:

- The current `TOKEN_CONTRACT_ID` and `GOVERNANCE_CONTRACT_ID` are written to a
  timestamped backup (`logs/backups/contracts_<network>_<YYYYMMDD_HHMMSS>.env`)
  by the deploy script — the same backup format used by the manual procedure
  below.
- The backup file is uploaded as a workflow artifact so the rollback job can
  retrieve it even on a fresh runner.

If the capture step fails, the workflow aborts before deploying anything, so a
bad deploy can never overwrite the last known-good reference.

### Automatic trigger on verification failure

The `health-check` job runs `scripts/health_check.sh` against `FRONTEND_URL`,
`NOTIFICATION_HEALTH_URL`, and the on-chain contracts. If any smoke test fails
(non-zero exit), the `rollback` job runs automatically with no manual
intervention:

1. It restores the captured previous version via `scripts/rollback.sh --latest`.
2. It invalidates the CloudFront cache so clients pick up the restored frontend.
3. It uploads the rollback log as an artifact (retained 30 days).

### Slack / webhook alert

The `incident-report` job runs after the rollback job (regardless of whether the
rollback succeeded) and posts a summary to `SLACK_WEBHOOK_URL` containing:

- the workflow run URL and the commit SHA that failed verification,
- which smoke test failed,
- the contract IDs restored by the rollback,
- whether the rollback itself succeeded.

If `SLACK_WEBHOOK_URL` is unset the job logs the summary instead of posting, so
the workflow never fails solely because of a missing webhook.

### Required GitHub secrets / variables

| Name | Type | Purpose |
|------|------|---------|
| `AWS_DEPLOY_ROLE_ARN` | Secret | IAM role with S3 write + CloudFront invalidation |
| `S3_BUCKET` | Secret | S3 bucket name |
| `CLOUDFRONT_DISTRIBUTION_ID` | Secret | CloudFront distribution ID |
| `STELLAR_SECRET_KEY` | Secret | Key used by `rollback.sh` to verify contracts |
| `SLACK_WEBHOOK_URL` | Secret | Incoming webhook for incident reports |
| `FRONTEND_URL` | Variable | Public URL of the frontend (for health probe) |
| `STELLAR_RPC_URL` | Variable | Soroban RPC endpoint |
| `STELLAR_HORIZON_URL` | Variable | Horizon endpoint |
| `NOTIFICATION_HEALTH_URL` | Variable | Notification service `/health` endpoint |
| `GOVERNANCE_CONTRACT_ID` | Variable | Deployed governance contract ID |
| `TOKEN_CONTRACT_ID` | Variable | Deployed token contract ID |

### Manual trigger with forced rollback

You can force a rollback without a new deploy via the GitHub Actions UI:

1. Go to **Actions → Deploy and Verify (Mainnet)**.
2. Click **Run workflow**.
3. Set `force_rollback` to `true`.

This calls `rollback.sh --latest` directly and posts a Slack incident report.

### Testing the rollback path in staging

Exercise the automated rollback in staging before relying on it in production:

1. Run the workflow against the staging environment (select the staging
   environment in the **Run workflow** dropdown, or push to the staging branch
   if your repo maps it that way).
2. To simulate a failed smoke test, either:
   - temporarily point `FRONTEND_URL` at an unreachable host, or
   - run with `force_rollback: true` to skip the deploy and go straight to the
     rollback + incident-report jobs.
3. Confirm the rollback job restores the captured previous version, the
   CloudFront invalidation completes, and the Slack/webhook alert arrives.
4. Check the uploaded rollback log artifact for the restored contract IDs.

Because `rollback.sh` is idempotent (see below), running this test repeatedly is
safe.

### Relationship to `scripts/rollback.sh`

The automated rollback job is a thin wrapper around `scripts/rollback.sh` — it
does not reimplement any rollback logic. The same script powers the manual
procedure documented below, so behaviour is identical whether a rollback is
triggered by a failed smoke test, a forced `workflow_dispatch`, or run by hand
on an operator's machine.

### Idempotency

`rollback.sh` is safe to run multiple times:

- If `.env` already contains the target contract IDs, the `sed -i` substitution
  is a no-op.
- On-chain contract verification (`stellar contract invoke … total_supply`) is a
  read-only call with no side effects.
- CloudFront invalidation of `/*` is idempotent — a second call simply schedules
  another invalidation for the same paths.

---

## How backups work

Every run of `deploy.sh` or `deploy_mainnet.sh` saves the current contract IDs to a timestamped file before touching anything:

```
logs/backups/contracts_<network>_<YYYYMMDD_HHMMSS>.env
```

Example:
```
# CosmosVote contract backup — 2026-06-02T05:00:00Z
# Network: testnet
TOKEN_CONTRACT_ID=CAABC...
GOVERNANCE_CONTRACT_ID=CBXYZ...
```

---

## Rollback steps

### 1. List available backups

```bash
./scripts/rollback.sh
```

### 2. Restore the most recent backup

```bash
./scripts/rollback.sh --latest
```

### 3. Restore a specific backup

```bash
./scripts/rollback.sh logs/backups/contracts_testnet_20260602_050000.env
```

The script will:
1. Read `TOKEN_CONTRACT_ID` and `GOVERNANCE_CONTRACT_ID` from the backup.
2. Update `.env` in-place (or print export commands if `.env` is absent).
3. Call `total_supply` and `get_proposal_count` on-chain to confirm the restored contracts respond (requires `STELLAR_SECRET_KEY`).

---

## Post-deployment verification

`deploy.sh` and `deploy_mainnet.sh` automatically verify both contracts respond before printing the success summary. If verification fails the script exits with an error — check the log file for details.

To verify manually at any time:

```bash
# Token contract
stellar contract invoke \
  --id "$TOKEN_CONTRACT_ID" \
  --source "$STELLAR_SECRET_KEY" \
  --rpc-url "$STELLAR_RPC_URL" \
  --network-passphrase "<passphrase>" \
  -- total_supply

# Governance contract
stellar contract invoke \
  --id "$GOVERNANCE_CONTRACT_ID" \
  --source "$STELLAR_SECRET_KEY" \
  --rpc-url "$STELLAR_RPC_URL" \
  --network-passphrase "<passphrase>" \
  -- get_proposal_count
```

---

## Partial deployment recovery

If deployment failed after the token contract was deployed but before governance was deployed:

1. Note the `TOKEN_CONTRACT_ID` printed in the logs (`logs/deploy_*.log`).
2. Set `TOKEN_CONTRACT_ID` in `.env` manually.
3. Re-run `deploy.sh` — the script will deploy a fresh governance contract and verify both.

If the partial deployment left a governance contract initialised against a stale token contract, treat it as dead and redeploy from scratch. Use `rollback.sh --latest` to restore the last known-good pair.

---

## Log files

All script output is tee'd to timestamped files under `logs/`:

| File pattern | Script |
|---|---|
| `logs/deploy_*.log` | `deploy.sh` |
| `logs/deploy_mainnet_*.log` | `deploy_mainnet.sh` |
| `logs/rollback_*.log` | `rollback.sh` |
| `logs/backups/contracts_*.env` | Pre-deployment backups |
