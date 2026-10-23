# Key Management Guide

This document covers secure handling of the `STELLAR_SECRET_KEY` used to deploy and operate CosmosVote contracts. A compromised admin key allows an attacker to transfer admin privileges, pause the contract, cancel proposals, and execute arbitrary passed proposals.

---

## Never store your secret key in a committed file

`.env` is listed in `.gitignore`. Never remove it from `.gitignore` and never commit a file that contains a real secret key. Use `.env.example` as a template only.

---

## Option 1 — AWS Secrets Manager

Store the key as a plaintext secret, then inject it at deploy time:

```bash
# Store the key (one-time setup)
aws secretsmanager create-secret \
  --name cosmosvote/stellar-secret-key \
  --secret-string "SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

# Retrieve and export before running deploy scripts
export STELLAR_SECRET_KEY=$(
  aws secretsmanager get-secret-value \
    --secret-id cosmosvote/stellar-secret-key \
    --query SecretString \
    --output text
)

bash scripts/deploy.sh
```

Rotate the secret with:

```bash
aws secretsmanager rotate-secret --secret-id cosmosvote/stellar-secret-key
```

For CI/CD (GitHub Actions), store the secret in GitHub Secrets and reference it as `${{ secrets.STELLAR_SECRET_KEY }}` — never echo or log it.

---

## Option 2 — HashiCorp Vault

```bash
# Store the key
vault kv put secret/cosmosvote stellar_secret_key="SXXX..."

# Retrieve and export before running deploy scripts
export STELLAR_SECRET_KEY=$(
  vault kv get -field=stellar_secret_key secret/cosmosvote
)

bash scripts/deploy.sh
```

Use [Vault Agent](https://developer.hashicorp.com/vault/docs/agent-and-proxy/agent) or the [Vault AWS auth method](https://developer.hashicorp.com/vault/docs/auth/aws) for automated, credential-less retrieval in production environments.

---

## Option 3 — Hardware Security Module (HSM)

For mainnet deployments, sign transactions with an HSM rather than an in-memory key:

1. Generate the Stellar keypair inside the HSM — the private key never leaves the device.
2. Use [Stellar Laboratory](https://laboratory.stellar.org/) or a Stellar SDK that supports external signers to construct and sign transactions.
3. The `STELLAR_SECRET_KEY` environment variable is not used in this flow; the HSM library handles signing directly.

Popular choices: AWS CloudHSM, Google Cloud HSM, YubiHSM 2, Ledger hardware wallet (via Stellar app).

---

## Key rotation procedure

1. Generate a new Stellar keypair (`stellar keys generate new-admin`).
2. Fund the new account on the target network.
3. Call `transfer_admin(current_admin, new_admin)` on the governance contract.
4. Call `accept_admin(new_admin)` from the new admin account to complete the two-step transfer.
5. Update the secret in your secrets manager with the new key.
6. Revoke / delete the old secret.
7. Verify `governance.admin()` returns the new address before decommissioning the old key.

---

## Least-privilege principle

- Use separate keys for testnet and mainnet.
- Use a dedicated deployer key with no token balance beyond what is needed for gas.
- Rotate keys after any suspected compromise or team member offboarding.

---

## Notification service API key rotation (Issue #119)

The notification service (`notification-service/`) authenticates its admin
API with bearer tokens (`ADMIN_API_KEY` / `VIEWER_API_KEY`). Those static
env-var keys have no revocation path: a compromised key stays valid for the
life of the deployment. `notification-service/src/keyStore.ts` adds a
rotating key store on top of that to close this gap.

### How it works

- Keys are stored as salted SHA-256 hashes in a JSON file
  (`API_KEY_STORE_PATH`, default `notification-service/data/api-keys.json`),
  never in plaintext. The raw key is only ever shown once, at creation time,
  on the CLI.
- `auth.ts` checks the key store first on every request. A key found in the
  store but marked revoked is rejected immediately with `401 Unauthorized`,
  even though the request otherwise looks well-formed.
- The static `ADMIN_API_KEY` / `VIEWER_API_KEY` env vars still work as a
  fallback for deployments that have not migrated to the key store, so this
  is backward compatible.

### Rotating a key

```bash
cd notification-service

# Generate a new admin key and revoke the previously active admin key
npm run keys:rotate -- admin
# -> prints the new key id and raw value (store it in your secrets manager now)

# Same for the viewer role
npm run keys:rotate -- viewer

# List all keys (ids + timestamps, never the raw value)
npm run keys:list

# Revoke a specific key immediately (e.g. on suspected compromise)
npm run keys:revoke -- <keyId>
```

After rotating, update the secret in your secrets manager (see Options 1–3
above) and redeploy the notification service so it picks up the new value
wherever it is injected as `Authorization: Bearer <key>`.

### Stale key alert

`npm run keys:check-stale` (default threshold: 90 days) lists any active key
that has not been rotated recently and exits with a non-zero status code
when it finds one, so it can be wired into a CI cron job or uptime/alerting
system to catch keys that nobody remembered to rotate:

```bash
npm run keys:check-stale -- 90
```

### Recommended rotation cadence

- Rotate admin/viewer keys at least every 90 days.
- Rotate immediately on suspected compromise or when a team member with
  access to the key leaves.
- Revoke the old key only after the new key has been confirmed working in
  production (the `rotate` command does this atomically: it revokes the old
  key for that role in the same operation as issuing the new one).
