# Contributor Onboarding Guide

Welcome to CosmosVote! This guide walks new contributors through setting up the project, understanding the codebase, and making their first contribution.

---

## 1. Repo Layout

```
cosmosvote/
├── contracts/
│   ├── governance/     # On-chain governance logic (proposals, voting, finalization)
│   └── token/          # SEP-41 governance token (balances, mint, burn, allowances)
├── docs/               # Architecture docs, ADRs, security, examples
├── frontend/           # React + Vite proposal browser UI
├── scripts/            # Deploy and test helper shell scripts
├── config/             # Network configs: local.toml, testnet.toml, mainnet.toml
├── .github/workflows/  # CI pipelines (fmt, lint, test, build, coverage)
├── Makefile            # Common dev targets
├── CONTRIBUTING.md     # Full contribution guidelines
└── README.md
```

### Key Packages

| Package | Path | Purpose |
|---------|------|---------|
| `cosmosvote-governance` | `contracts/governance/` | Core proposal & voting contract |
| `cosmosvote-token` | `contracts/token/` | SEP-41 governance token contract |
| Frontend | `frontend/` | React UI for browsing proposals |

---

## 2. Local Setup

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Rust | 1.75+ | https://rustup.rs |
| wasm32 target | — | `rustup target add wasm32-unknown-unknown` |
| Stellar CLI | 22+ | https://stellar.org/cli (optional, for deploy) |
| Docker | any | https://docker.com (optional) |

### Steps

```bash
# 1. Fork on GitHub, then clone your fork
git clone https://github.com/<your-username>/cosmosvote.git
cd cosmosvote

# 2. Add the upstream remote
git remote add upstream https://github.com/mercyJJ/cosmosvote.git

# 3. Add WASM target
rustup target add wasm32-unknown-unknown

# 4. Build and test to verify your setup
make test
make build
```

All 60+ tests should pass with no errors.

---

## 3. First-Issue Workflow

```
Find issue → comment to claim it → branch → change → test → PR
```

1. Browse [open issues](https://github.com/mercyJJ/cosmosvote/issues) filtered by `good first issue` or `documentation`.
2. Comment on the issue to let maintainers know you're working on it.
3. Pull the latest main and create a focused branch:

```bash
git checkout main
git pull upstream main
git checkout -b <type>/<short-description>-<issue-number>
# e.g. docs/update-storage-diagram-312
#      fix/quorum-edge-case-298
#      feat/proposal-delegation-305
```

4. Make your changes, keeping the scope tight to the issue.
5. Run the full check suite before pushing:

```bash
make fmt       # auto-format
make lint      # clippy
make test      # all unit + property tests
make build     # WASM compilation check
```

6. Commit using [Conventional Commits](https://www.conventionalcommits.org/):

```bash
git commit -m "fix: prevent quorum bypass on abstain-only votes (#298)"
```

7. Push and open a PR against `main` in the upstream repo, linking the issue:

```bash
git push -u origin <your-branch>
gh pr create --repo mercyJJ/cosmosvote --base main \
  --title "fix: prevent quorum bypass (#298)" \
  --body "Closes #298"
```

---

## 4. Testing Commands

```bash
make test                                        # all tests
cargo test -p cosmosvote-governance --features testutils  # governance only
cargo test -p cosmosvote-token --features testutils       # token only
cargo test prop_ --all --features testutils               # property-based tests
make coverage                                    # HTML coverage report → coverage/
```

---

## 5. Useful Docs

| Doc | Purpose |
|-----|---------|
| [GETTING_STARTED.md](./GETTING_STARTED.md) | Build, deploy, and interact with contracts |
| [lifecycle.md](./lifecycle.md) | Proposal state machine |
| [storage.md](./storage.md) | Soroban storage tier strategy |
| [errors.md](./errors.md) | Full error reference |
| [faq.md](./faq.md) | Common questions |
| [docs/adr/](./adr/) | Architecture Decision Records |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Full contribution guidelines |
| [SECURITY.md](../SECURITY.md) | Vulnerability disclosure |

---

## 6. Getting Help

- Open a [GitHub Discussion](https://github.com/mercyJJ/cosmosvote/discussions) for questions.
- Review existing issues and PRs for context on ongoing work.
- Check `docs/adr/` for rationale behind key design decisions.
