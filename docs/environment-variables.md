# Environment Variables & Secret Injection

This document covers every environment variable used by CosmosVote — scripts, deployment, backend, notification service, keeper service, and the frontend — with examples for local development and production.

---

## Quick Start

```bash
# Backend / scripts (root)
cp .env.example .env

# Backend service
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env.local

# Notification service
cp notification-service/.env.example notification-service/.env

# Keeper service
cp keeper-service/.env.example keeper-service/.env
```

Never commit `.env` or `.env.local` to version control. Both files are listed in `.gitignore`.

---

## Root / Script Variables (`.env`)

These variables are used by deployment scripts (`scripts/deploy.sh`, `scripts/deploy_mainnet.sh`) and CLI tooling.

### Network

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NETWORK` | ✅ | `local` | Target network. One of `local`, `testnet`, `mainnet`. |
| `STELLAR_RPC_URL` | ✅ | `http://localhost:8000` | Soroban RPC endpoint. |
| `STELLAR_NETWORK_PASSPHRASE` | ✅ | Standalone passphrase | Network passphrase for transaction signing. |

**Per-network values:**

| Network | `STELLAR_RPC_URL` | `STELLAR_NETWORK_PASSPHRASE` |
|---------|-------------------|------------------------------|
| `local` | `http://localhost:8000` | `Standalone Network ; February 2021` |
| `testnet` | `https://soroban-testnet.stellar.org` | `Test SDF Network ; September 2015` |
| `mainnet` | `https://soroban-mainnet.stellar.org` | `Public Global Stellar Network ; September 2015` |

### Admin Keys

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STELLAR_SECRET_KEY` | ✅ | — | Stellar secret key (`S...`, 56 chars) for the deploying admin account. **Never share or commit this value.** For production, inject via your CI/CD secrets manager — see [Secret Injection](#secret-injection) below. |

### Contract Addresses

Populated automatically by `scripts/deploy.sh`. Set manually if deploying outside the script.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOVERNANCE_CONTRACT_ID` | ✅ (post-deploy) | — | Deployed governance contract address (`C...`, 56 chars). |
| `TOKEN_CONTRACT_ID` | ✅ (post-deploy) | — | Deployed token contract address (`C...`, 56 chars). |

### Governance Parameters

These configure the on-chain governance contract at initialization time.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MIN_PROPOSAL_BALANCE` | ❌ | `1000000` | Minimum token balance (in base units) to submit a proposal. Set `0` to disable. Recommended mainnet value: `10000000` (1 VOTE). |
| `PROPOSAL_COOLDOWN` | ❌ | `86400` | Minimum seconds between proposals per address. Set `0` to disable. |
| `RESTRICT_ADMIN_VOTE` | ❌ | `true` | If `true`, the admin cannot vote on proposals they created. |
| `CONCENTRATION_THRESHOLD_BPS` | ❌ | `0` | Circuit breaker threshold in basis points (e.g. `5000` = 50%). If a voter's weight exceeds this fraction of total supply when casting a vote, the contract emits a `concentration_alert` event and auto-pauses. Set `0` to disable the circuit breaker entirely. |

### Token Parameters

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `INITIAL_TOKEN_SUPPLY` | ❌ | `1000000000` | Initial token supply (base units) minted to the admin address on first deploy. |

---

## Backend Service Variables (`backend/.env`)

The backend service polls contract events and delivers them via webhook.

### Error Tracking & Observability

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SENTRY_DSN` | ❌ | — | Sentry DSN for error tracking. Leave blank to disable Sentry. Errors will be logged to stderr only. |
| `NODE_ENV` | ❌ | `development` | Application environment: `development`, `staging`, or `production`. Reported to Sentry. |
| `APP_VERSION` | ❌ | — | Application version reported to Sentry (e.g. git SHA or semver tag). |
| `LOG_LEVEL` | ❌ | `info` | Structured JSON log level: `trace`, `debug`, `info`, `warn`, `error`, or `fatal`. |

### Stellar / Event Polling

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STELLAR_RPC_URL` | ✅ | `http://localhost:8000` | Soroban RPC endpoint to poll for contract events. |
| `GOVERNANCE_CONTRACT_ID` | ✅ | — | Governance contract address to monitor. |
| `TOKEN_CONTRACT_ID` | ❌ | — | Token contract address (used for token event monitoring). |
| `POLL_INTERVAL_MS` | ❌ | `6000` | How often to poll for new events, in milliseconds. |
| `WEBHOOK_URL` | ✅ | — | Outbound HTTP endpoint to POST governance events to (e.g. your notification handler). |

### Health Server

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HEALTH_PORT` | ❌ | `8080` | TCP port for the health-check HTTP server. Exposes `/health` and `/ready` endpoints. |

### Faucet (Testnet Only)

The optional token faucet is only for testnet and staging. **Never use a mainnet admin key with the faucet.**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FAUCET_ENABLED` | ❌ | `false` | Set `true` to enable the faucet HTTP service alongside the backend. |
| `FAUCET_PORT` | ❌ | `3001` | TCP port for the faucet server. |
| `FAUCET_ALLOWED_ORIGIN` | ❌ | — | CORS `Access-Control-Allow-Origin` header value for the faucet (e.g. `https://your-frontend.example`). |
| `FAUCET_TOKEN_CONTRACT_ID` | ❌ | — | Token contract to drip from. Typically same as `TOKEN_CONTRACT_ID`. |
| `FAUCET_ADMIN_SECRET_KEY` | ❌ | — | Secret key that holds faucet tokens. Must be different from the governance admin key. |
| `FAUCET_RPC_URL` | ❌ | `https://soroban-testnet.stellar.org` | RPC endpoint for faucet transactions. |
| `FAUCET_AMOUNT` | ❌ | `1000000000` | Amount of tokens to drip per request, in base units. `1000000000` = 100 VOTE at 7 decimals. |
| `FAUCET_TOKEN_DECIMALS` | ❌ | `7` | Token decimal places (used for display only). |
| `FAUCET_DB_PATH` | ❌ | `/data/faucet.sqlite` | Path to the SQLite database for faucet claim tracking. Mount durable storage here in container deployments. |

---

## Notification Service Variables (`notification-service/.env`)

The notification service watches Horizon for governance events and delivers them to subscribers via email, webhook, Slack, or Discord.

### Stellar / Horizon

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HORIZON_URL` | ✅ | `https://horizon-testnet.stellar.org` | Horizon endpoint to stream governance events from. Use `https://horizon.stellar.org` for mainnet. |
| `GOVERNANCE_CONTRACT_ID` | ✅ | — | Governance contract address to monitor. |
| `POLL_INTERVAL_MS` | ❌ | `15000` | How often to poll Horizon for new events, in milliseconds. |

### API Authentication

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ADMIN_API_KEY` | ⚠️ | — | Bearer token granting the admin role (manage subscribers, view all data). **If unset, admin endpoints are unprotected.** Always set in production. |
| `VIEWER_API_KEY` | ❌ | — | Bearer token granting the viewer role (read-only access). Optional; omit to disable viewer-only access. |

### Graceful Shutdown

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SHUTDOWN_TIMEOUT_MS` | ❌ | `30000` | Grace period in milliseconds to wait for in-flight webhook deliveries and DB writes before forceful exit. |

### Data Persistence

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUBSCRIPTIONS_FILE` | ❌ | `./data/subscriptions.json` | Path to the JSON file that persists subscriber records. In container deployments, mount a durable volume at this path. |

### Email Channel (nodemailer / SMTP)

Used when a subscriber has an `email` field set.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMTP_HOST` | ❌ | — | SMTP server hostname (e.g. `smtp.sendgrid.net`). Required if any subscriber uses email. |
| `SMTP_PORT` | ❌ | `587` | SMTP port. `587` for STARTTLS, `465` for SSL, `25` for plain. |
| `SMTP_USER` | ❌ | — | SMTP authentication username. |
| `SMTP_PASS` | ❌ | — | SMTP authentication password. **Treat as a secret.** |
| `EMAIL_FROM` | ❌ | — | `From` address for outgoing emails (e.g. `cosmosvote@example.com`). |

### Slack Channel

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SLACK_WEBHOOK_URL` | ❌ | — | Global Slack Incoming Webhook URL. Used when a subscriber does not specify their own `slackWebhookUrl`. Create at: https://api.slack.com/messaging/webhooks |

### Discord Channel

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_WEBHOOK_URL` | ❌ | — | Global Discord Webhook URL. Used when a subscriber does not specify their own `discordWebhookUrl`. Create at: Server Settings → Integrations → Webhooks. |

---

## Keeper Service Variables (`keeper-service/.env`)

The keeper service automatically finalises proposals that have expired.

### Network

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NETWORK` | ❌ | `testnet` | Target network. One of `local`, `testnet`, `mainnet`. |
| `SOROBAN_RPC_URL` | ✅ | `https://soroban-testnet.stellar.org` | Soroban RPC endpoint. Note: this variable is named `SOROBAN_RPC_URL` (not `STELLAR_RPC_URL`) in the keeper service. |

### Contract & Keeper Keys

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOVERNANCE_CONTRACT_ID` | ✅ | — | Governance contract address to monitor and finalise proposals on. |
| `KEEPER_SECRET_KEY` | ✅ | — | Secret key for the keeper account. This account pays gas for `finalise` calls and must be funded with XLM. |

### Polling & Logging

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POLL_INTERVAL_MINUTES` | ❌ | `10` | How often the keeper scans for finalisable proposals, in minutes. |
| `LOG_LEVEL` | ❌ | `info` | Log level: `trace`, `debug`, `info`, `warn`, `error`, or `fatal`. |

### Alert Channels

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SLACK_WEBHOOK_URL` | ❌ | — | Slack Incoming Webhook URL to send keeper alerts to. |
| `DISCORD_WEBHOOK_URL` | ❌ | — | Discord Webhook URL to send keeper alerts to. |
| `ALERT_EMAIL` | ❌ | — | Email address to send keeper alerts to. Requires SMTP settings. |
| `SMTP_HOST` | ❌ | — | SMTP server hostname for keeper email alerts. |
| `SMTP_PORT` | ❌ | `587` | SMTP port for keeper email alerts. |
| `SMTP_USER` | ❌ | — | SMTP username for keeper email alerts. |
| `SMTP_PASS` | ❌ | — | SMTP password for keeper email alerts. **Treat as a secret.** |

---

## Frontend Variables (`frontend/.env.local`)

Vite exposes only variables prefixed with `VITE_` to the browser bundle.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_NETWORK` | ✅ | — | Network to connect to. One of `testnet`, `mainnet`. |
| `VITE_GOVERNANCE_CONTRACT_ID` | ✅ | — | Governance contract address (`C...`, 56 chars). |
| `VITE_TOKEN_CONTRACT_ID` | ✅ | — | Token contract address (`C...`, 56 chars). |
| `VITE_STELLAR_RPC_URL` | ❌ | — | Optional override for the Soroban RPC endpoint used by the frontend. If unset, the frontend uses the default for the configured `VITE_NETWORK`. |

The frontend validates these at startup via `validateConfig()` in `src/config.ts` and shows a clear error banner if they are missing or malformed.

---

## Monitoring Script Variables

These variables are read by `scripts/monitor.js` and `scripts/admin_monitor.js`.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HORIZON_URL` | ❌ | `https://horizon-testnet.stellar.org` | Horizon endpoint for event streaming (admin_monitor.js). |
| `LARGE_TRANSFER_THRESHOLD` | ❌ | `1000000000000` | Token transfer amount in base units that triggers a large-transfer alert (monitor.js). |
| `RAPID_VOTE_BURST` | ❌ | `50` | Minimum number of votes within a single poll window to trigger a rapid-voting-burst alert (monitor.js). |
| `SLACK_WEBHOOK_URL` | ❌ | — | Slack Incoming Webhook URL for admin_monitor.js alerts. |

---

## Example Configurations

### Local Development

```bash
# .env (root)
NETWORK=local
STELLAR_RPC_URL=http://localhost:8000
STELLAR_NETWORK_PASSPHRASE="Standalone Network ; February 2021"
STELLAR_SECRET_KEY=SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
GOVERNANCE_CONTRACT_ID=
TOKEN_CONTRACT_ID=
MIN_PROPOSAL_BALANCE=0
PROPOSAL_COOLDOWN=0
RESTRICT_ADMIN_VOTE=false
CONCENTRATION_THRESHOLD_BPS=0
INITIAL_TOKEN_SUPPLY=1000000000
```

```bash
# frontend/.env.local
VITE_NETWORK=testnet
VITE_GOVERNANCE_CONTRACT_ID=CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
VITE_TOKEN_CONTRACT_ID=CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
```

### Testnet

```bash
# .env (root)
NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
STELLAR_SECRET_KEY=SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
GOVERNANCE_CONTRACT_ID=C...
TOKEN_CONTRACT_ID=C...
MIN_PROPOSAL_BALANCE=1000000
PROPOSAL_COOLDOWN=86400
RESTRICT_ADMIN_VOTE=true
CONCENTRATION_THRESHOLD_BPS=0
INITIAL_TOKEN_SUPPLY=1000000000
```

### Production (Mainnet)

Never store `STELLAR_SECRET_KEY` in a plain `.env` file in production. Use secret injection instead — see below.

```bash
# .env (non-secret values only)
NETWORK=mainnet
STELLAR_RPC_URL=https://soroban-mainnet.stellar.org
STELLAR_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
GOVERNANCE_CONTRACT_ID=C...
TOKEN_CONTRACT_ID=C...
MIN_PROPOSAL_BALANCE=10000000
PROPOSAL_COOLDOWN=86400
RESTRICT_ADMIN_VOTE=true
CONCENTRATION_THRESHOLD_BPS=5000
INITIAL_TOKEN_SUPPLY=1000000000
```

---

## Secret Injection

Sensitive values that must never be committed to version control:

| Variable | Service | Notes |
|----------|---------|-------|
| `STELLAR_SECRET_KEY` | Root scripts | Governance admin key — highest privilege |
| `KEEPER_SECRET_KEY` | Keeper service | Must be funded with XLM |
| `FAUCET_ADMIN_SECRET_KEY` | Backend (faucet) | Testnet/staging only |
| `SMTP_PASS` | Notification service, Keeper | Email auth password |
| `ADMIN_API_KEY` | Notification service | API auth secret |
| `VIEWER_API_KEY` | Notification service | API auth secret |

### GitHub Actions

```yaml
- name: Deploy contracts
  env:
    STELLAR_SECRET_KEY: ${{ secrets.STELLAR_SECRET_KEY }}
  run: bash scripts/deploy.sh
```

Store values in **Settings → Secrets and variables → Actions**.

### Docker / docker-compose

```yaml
# docker-compose.yml
services:
  deploy:
    environment:
      - STELLAR_SECRET_KEY=${STELLAR_SECRET_KEY}
```

Pass at runtime:
```bash
STELLAR_SECRET_KEY=S... docker compose run deploy
```

### Other CI/CD systems

Inject secrets as environment variables from your platform's secret store (HashiCorp Vault, AWS Secrets Manager, etc.) and never write them to disk.

---

## Validation

Run `scripts/validate-env.sh` before any deployment to confirm all required variables are set:

```bash
bash scripts/validate-env.sh
```

The frontend performs its own validation on startup via `src/config.ts`.
