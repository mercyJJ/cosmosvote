# Frontend Deployment (S3 + CloudFront — Multi-Region CDN)

The frontend is deployed to AWS S3 + CloudFront via Terraform and GitHub Actions.
CloudFront serves the site from **all global edge locations** in production
(`PriceClass_All`), ensuring low latency for users worldwide. Staging uses
`PriceClass_100` (North America + Europe only) to keep costs low during testing.

## Infrastructure

Terraform configuration lives in `infra/terraform/`.

| File | Purpose |
|------|---------|
| `main.tf` | S3 bucket, CloudFront distribution, OAC, cache policies |
| `variables.tf` | Input variables (including `cdn_price_class`, `immutable_assets_max_age`) |
| `outputs.tf` | Bucket name, CloudFront domain/ID, cache policy IDs |
| `envs/staging.tfvars` | Staging: `PriceClass_100`, 1-hour asset TTL |
| `envs/production.tfvars` | Production: `PriceClass_All`, 1-year asset TTL |

## Cache Behaviour

Two CloudFront behaviours are configured:

| Path pattern | Cache policy | Cache-Control | Notes |
|---|---|---|---|
| `/assets/*` | `cosmosvote-immutable-assets-<env>` | `public, max-age=31536000, immutable` | Vite emits content-addressed files here (hash in filename). Safe to cache for 1 year. |
| `/*` (default) | `cosmosvote-no-cache-html-<env>` | `no-cache, no-store, must-revalidate` | `index.html` and any non-hashed resource. Always fetched fresh so new deploys are instant. |

Both behaviours enforce **HTTPS** via `redirect-to-https` and enable **Brotli + gzip** compression at the edge.

## Price Class Options

Control the set of active edge locations with the `cdn_price_class` variable:

| Value | Edge locations | Use case |
|---|---|---|
| `PriceClass_All` | All AWS regions globally | Production — lowest latency worldwide |
| `PriceClass_200` | NA, Europe, Asia, ME, Africa | Mid-tier cost/coverage |
| `PriceClass_100` | North America + Europe only | Staging / dev — lowest cost |

## First-time Setup

```bash
cd infra/terraform

# Staging (low cost, NA+Europe only)
terraform init -backend-config="envs/staging.s3.tfbackend"
terraform apply -var-file=envs/staging.tfvars -var='faucet_api_origin=https://your-faucet.example.com'

# Production (all global edge locations)
terraform init -backend-config="envs/production.s3.tfbackend"
terraform apply -var-file=envs/production.tfvars -var='faucet_api_origin=https://your-faucet.example.com'
```

Record the outputs and add them as GitHub secrets/variables:

| Output | GitHub secret/variable |
|--------|----------------------|
| `s3_bucket` | `S3_BUCKET` |
| `cloudfront_distribution_id` | `CLOUDFRONT_DISTRIBUTION_ID` |

Also set:
- `AWS_DEPLOY_ROLE_ARN` — IAM role ARN with S3 write + CloudFront invalidation permissions
- `GOVERNANCE_CONTRACT_ID` (variable) — deployed governance contract ID
- `TOKEN_CONTRACT_ID` (variable) — deployed token contract ID
- `STELLAR_RPC_URL` (variable) — RPC endpoint

## Environment Config Injection

Vite reads environment variables prefixed with `VITE_` at build time. The CI workflow injects:

```
VITE_GOVERNANCE_CONTRACT_ID
VITE_TOKEN_CONTRACT_ID
VITE_STELLAR_NETWORK
VITE_STELLAR_RPC_URL
VITE_FAUCET_API_URL
```

Use them in the frontend via `import.meta.env.VITE_*`.

For testnet faucet deployment, set `FAUCET_API_URL` as a GitHub Actions variable to the HTTPS origin hosting the faucet service. The Terraform environment must use the same origin as `faucet_api_origin` so the production CSP permits faucet requests. `faucet_api_origin` is required when applying the frontend distribution; the CSP report collector endpoint is provisioned automatically.

Deploy the faucet as a separate backend service using `backend/Dockerfile`. Set `FAUCET_ENABLED=true`, `FAUCET_ALLOWED_ORIGIN` to the frontend origin, `FAUCET_TOKEN_CONTRACT_ID` to the testnet token, and `FAUCET_ADMIN_SECRET_KEY` from the deployment secret manager. Mount durable storage at `/data` and run a single service instance so the SQLite 24-hour claim limit remains authoritative. Never configure a mainnet admin key.

## CI/CD

The `.github/workflows/deploy-frontend.yml` workflow triggers on pushes to `main` that touch `frontend/` or `infra/terraform/`. It:

1. Builds the frontend with environment-specific config
2. Syncs the `dist/` output to S3:
   - Static assets (`dist/assets/*`) — `Cache-Control: public, max-age=31536000, immutable`
   - `index.html` — `Cache-Control: no-cache, no-store, must-revalidate`
3. Invalidates the CloudFront distribution (`/*`)

CloudFront's own cache policies (TTL 0 for HTML, 1 year for assets) enforce the same behaviour at the CDN layer independently of the S3 object metadata.

## Manual Deploy

```bash
cd frontend
VITE_GOVERNANCE_CONTRACT_ID=<id> \
VITE_TOKEN_CONTRACT_ID=<id> \
VITE_STELLAR_NETWORK=mainnet \
npm run build

# Immutable assets (content-addressed — safe to cache 1 year)
aws s3 sync dist/assets/ s3://<bucket>/assets/ \
  --cache-control "public,max-age=31536000,immutable"

# HTML shell — always fresh
aws s3 cp dist/index.html s3://<bucket>/index.html \
  --cache-control "no-cache,no-store,must-revalidate"

# Invalidate edge cache
aws cloudfront create-invalidation --distribution-id <id> --paths "/*"
```

## HTTPS Enforcement

HTTPS is enforced at two layers:

1. **CloudFront** — `viewer_protocol_policy = "redirect-to-https"` on every cache behaviour. HTTP requests are automatically redirected to HTTPS with a 301.
2. **HSTS header** — The `strict_transport_security` response header policy sets `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`, instructing browsers to never connect over plain HTTP.

