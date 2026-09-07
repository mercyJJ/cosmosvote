# Changelog

All notable changes to CosmosVote are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). .
Versioning follows [Semantic Versioning](https://semver.org/).

---

## Contributing to the Changelog

### When to add a changelog entry

Every PR that changes observable behaviour **must** include a changelog entry under `[Unreleased]`. Pure refactors, typo fixes, and CI-only changes may be omitted at the author's discretion.

### Entry format

Add a single line under the appropriate sub-heading inside `[Unreleased]`:

```
## [Unreleased]

### Added
- Short description of the new feature (#PR-number)

### Changed
- Short description of a behavioural change (#PR-number)

### Fixed
- Short description of a bug fix (#PR-number)

### Breaking Changes
- **BREAKING** Short description of the breaking change and migration path (#PR-number)

### Security
- Short description of a security fix (#PR-number)

### Removed
- Short description of something removed (#PR-number)
```

### Categories

| Category | Use when |
|----------|----------|
| `Added` | New feature, function, endpoint, or document |
| `Changed` | Existing behaviour modified in a non-breaking way |
| `Fixed` | Bug or incorrect behaviour corrected |
| `Breaking Changes` | Callers must update code or config to upgrade |
| `Security` | Vulnerability patched or hardening added |
| `Removed` | Feature or API removed |

### Commit and PR conventions

Commits must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add proposal delegation support
fix: prevent quorum bypass on abstain-only votes
docs: add local deployment guide
test: add edge case for zero-balance voter
chore: upgrade soroban-sdk to 22.x
```

The commit type maps directly to a changelog category:

| Commit type | Changelog category |
|-------------|-------------------|
| `feat` | Added |
| `fix` | Fixed |
| `refactor` | Changed |
| `docs` | Added (if user-visible) |
| `feat!` / `BREAKING CHANGE` footer | Breaking Changes |
| `security` | Security |

### Example entries

```markdown
## [Unreleased]

### Added
- Local Soroban deployment guide at `docs/local-deployment.md` (#330)
- WASM binary size budget enforcement in CI (#315)
- Preview deployment workflow for frontend PRs (#318)

### Fixed
- Double-vote guard now checked before token balance lookup (#142)

### Breaking Changes
- **BREAKING** `initialise` renamed to `initialize` — update all contract invocation scripts (#201)

### Security
- Replaced unchecked arithmetic with `checked_add` in vote tallying (#178)
```

### Releasing a version

When cutting a release:

1. Rename `[Unreleased]` to the new version with today's date:
   ```
   ## [1.1.0] — 2026-07-01
   ```
2. Add a fresh empty `[Unreleased]` section above it.
3. Add a comparison link at the bottom of the file:
   ```
   [1.1.0]: https://github.com/mercyJJ/cosmosvote/compare/v1.0.0...v1.1.0
   ```
4. Tag the release commit: `git tag v1.1.0 && git push --tags`.

---

## [Unreleased]

---

## [1.0.0] — 2026-05-17

### Added

- `cosmosvote-governance` contract: proposals, voting, finalization, execution, cancellation
- `cosmosvote-token` contract: SEP-41-compatible governance token with mint/burn/transfer/allowances
- Token-weighted voting with live balance snapshots
- Three-way voting: Yes / No / Abstain
- Double-vote prevention via persistent `HasVoted` flag
- Quorum enforcement at finalization
- Admin controls: pause/unpause, update quorum, transfer admin
- Proposal cooldown and minimum balance requirements
- On-chain events for all state transitions
- Tiered storage strategy (instance / persistent / temporary)
- 40+ unit tests for governance contract
- 20+ unit tests for token contract
- Property-based tests with `proptest`
- Docker + Docker Compose development environment
- Deployment scripts for local, testnet, and mainnet
- GitHub Actions CI, CodeQL, and release workflows
- React + Vite frontend proposal browser
- Full documentation: README, ADRs, security docs, examples

[Unreleased]: https://github.com/mercyJJ/cosmosvote/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/mercyJJ/cosmosvote/releases/tag/v1.0.0
