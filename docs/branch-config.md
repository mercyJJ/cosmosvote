**Branch Config**

This project supports branch-specific environment flags to make deployments
and feature toggles safe and predictable per-branch.

Conventions
- Create branch-specific env files at the repository root named `.env.<branch>`
  (example: `.env/main`, `.env/feature/my-new-flag`).
- These files may contain non-sensitive defaults and feature flags. DO NOT
  commit private keys or secrets; store secrets in CI provider secret stores.

How it works
- `scripts/deploy.sh` will:
  - accept `--branch <name>` to explicitly select a branch env file
  - detect `GITHUB_REF` in CI or use `git rev-parse --abbrev-ref HEAD` locally
  - if `.env.<branch>` exists, source it before falling back to `.env`
  - branch-specific values override defaults from `.env`

Usage
- Local (use current git branch):
  ```bash
  ./scripts/deploy.sh
  ```
- Local (explicit branch):
  ```bash
  ./scripts/deploy.sh --branch feature/my-new-flag
  ```
- CI (GitHub Actions): ensure `GITHUB_REF` is available (normal), and create
  a `.env.<branch>` file containing non-sensitive defaults in the workflow
  workspace if needed, or set required values via GitHub Secrets.

Recommendations
- Keep `config/mainnet.toml`, `config/testnet.toml`, and `config/local.toml`
  as canonical network config files for operational use; use `.env.<branch>`
  for branch-scoped overrides and feature flags.
- Never commit private keys or credentials in branch env files. Use CI secrets
  for protected values and provide `.env.example` documenting required keys.

---

## Branch Protection Rules (GitHub)

The `main` branch is the canonical integration branch and must be protected so
that no change lands without review and passing CI. The
`.github/workflows/branch-protection.yml` workflow programmatically enforces
the settings below — it runs on a daily schedule and on `workflow_dispatch`
and fails the check if any requirement is missing.

> Reading branch protection rules requires repository **admin** privileges.
> Provide an admin-scoped PAT via the `BRANCH_PROTECTION_TOKEN` repository
> secret so the workflow can validate the configuration. When the secret is
> absent the workflow falls back to the default `GITHUB_TOKEN`.

### Required settings on `main`

| Setting | Required value |
| --- | --- |
| Require a pull request before merging | ✅ Enabled |
| Required approving reviews | **≥ 1** |
| Require status checks to pass before merging | ✅ Enabled |
| Require branches to be up to date before merging | ✅ Enabled |

### Required status checks

These CI contexts (job `name`s from `.github/workflows/ci.yml` and
`matrix.yml`) must be present in the "Require status checks to pass before
merging" list:

- `Formatting`
- `Clippy`
- `Tests`
- `Build WASM`
- `License Compliance`
- `actionlint`
- `Frontend Coverage`
- `Frontend (Node 20)` *(matrix.yml)*
- `Contracts (Rust stable)` *(matrix.yml)*

### How to configure (repository admin)

Using the `gh` CLI:

```bash
gh api -X PUT repos/:owner/:repo/branches/main/protection \
  -f required_pull_request_reviews_required_approving_review_count=1 \
  -f required_status_checks_strict=true \
  -f required_status_checks_contexts=Formatting \
  -f required_status_checks_contexts=Clippy \
  -f required_status_checks_contexts=Tests \
  -f required_status_checks_contexts="Build WASM" \
  -f required_status_checks_contexts="License Compliance" \
  -f required_status_checks_contexts=actionlint \
  -f required_status_checks_contexts="Frontend Coverage" \
  -f required_status_checks_contexts="Frontend (Node 20)" \
  -f required_status_checks_contexts="Contracts (Rust stable)" \
  -f enforce_admins=true \
  -f restrictions=
```

Or configure via **Settings → Branches → Branch protection rules** in the
GitHub web UI, adding `main` and ticking the boxes above.

### Verification

Run the workflow manually (the "Run workflow" button on the
`Enforce Branch Protection` workflow) or wait for the daily schedule. The job
prints a summary of the enforced checks and fails if any required context or
reviewer is missing. See
[docs/branch-config.md](../docs/branch-config.md) for the canonical list of
required settings.
