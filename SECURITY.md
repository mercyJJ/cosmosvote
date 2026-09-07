# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | ✅ Yes    |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report security issues by emailing **joymercy7879@gmail.com** with:

1. A description of the vulnerability
2. Steps to reproduce
3. Potential impact assessment
4. Any suggested mitigations

You will receive an acknowledgment within **48 hours** and a full response within **7 days**.

## Disclosure Policy

- We follow [responsible disclosure](https://en.wikipedia.org/wiki/Responsible_disclosure)
- We will coordinate a fix and release before public disclosure.
- Credit will be given to reporters in the release notes (unless anonymity is requested)
- We do not pursue legal action against good-faith security researchers

## Security Properties

CosmosVote is designed with the following security guarantees:

| Property | Implementation |
|----------|---------------|
| Vote integrity | Each address votes once per proposal; weight = live balance |
| No double-voting | Persistent `HasVoted` flag checked before every vote |
| Auth enforcement | `require_auth()` on all state-changing operations |
| Arithmetic safety | `checked_add` / `checked_sub` on all token amounts |
| Initialization safety | One-time init guard; admin/token immutable after init |
| Emergency pause | Admin can pause all state-changing operations |

## Known Limitations

See [docs/security/known-issues.md](./docs/security/known-issues.md) for documented limitations and accepted risks.

## Dependency Vulnerability Scanning

All dependencies are scanned automatically on every CI run and weekly:

| Tool | Scope | Failure threshold |
|------|-------|-------------------|
| `cargo audit` | Rust crates | Any advisory |
| `npm audit` | Frontend packages | High or critical CVEs |
| Dependabot | Rust, npm, GitHub Actions | Automated PRs weekly |

### Vulnerability Response Process

1. **Detection** — `cargo audit` / `npm audit` fails CI, or Dependabot opens a PR.
2. **Triage** — maintainer assesses severity within **48 hours**.
3. **Patch** — dependency updated or workaround applied within **7 days** for high/critical, **30 days** for moderate.
4. **Release** — patched version published with a CHANGELOG entry.
5. **Disclosure** — public advisory issued after the fix is deployed.

## Audit Status

See [AUDIT.md](./AUDIT.md) for audit history and scope.
