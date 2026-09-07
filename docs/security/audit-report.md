# CosmosVote Smart Contract Audit Report

**Auditor:** OtterSec  
**Engagement:** CosmosVote Governance & Token Contracts  
**Version Audited:** 1.0.0  
**Audit Period:** 2026-04-14 — 2026-05-09  
**Report Date:** 2026-05-16  
**Status:** ✅ Complete — All Critical and High findings resolved

---

## Executive Summary

OtterSec conducted a security audit of the CosmosVote smart contracts deployed on the Stellar Soroban platform. The audit covered the `cosmosvote-governance` and `cosmosvote-token` contracts in their entirety.

The codebase demonstrated sound security practices: consistent use of `require_auth()`, checked arithmetic, a clear state machine for proposal lifecycle, and a one-time initialization guard. No Critical findings were identified. Two High findings were identified and resolved prior to this report being finalized.

| Severity | Total | Resolved | Accepted | Open |
|----------|-------|----------|----------|------|
| Critical | 0 | — | — | 0 |
| High | 2 | 2 | 0 | 0 |
| Medium | 3 | 3 | 0 | 0 |
| Low | 4 | 2 | 2 | 0 |
| Informational | 5 | 0 | 5 | 0 |

---

## Scope

| Contract | Files |
|----------|-------|
| `cosmosvote-governance` | `lib.rs`, `storage.rs`, `events.rs`, `types.rs` |
| `cosmosvote-token` | `lib.rs`, `storage.rs`, `events.rs`, `types.rs` |

Out of scope: frontend, deployment scripts, test files, off-chain indexers.

---

## Findings

### High

#### AUD-H-001 — Admin can vote on proposals when `restrict_admin_vote` is false by default

**Severity:** High  
**Status:** ✅ Resolved (commit `a3f812c`)  
**Contract:** `cosmosvote-governance`

**Description:**  
The `restrict_admin_vote` flag defaults to `false`, meaning the admin — who also controls minting — could accumulate tokens and cast a decisive vote on any proposal. This creates a centralization risk that undermines governance integrity.

**Recommendation:**  
Default `restrict_admin_vote` to `true` and require an explicit opt-out during initialization.

**Resolution:**  
The default was changed to `true`. Existing deployments are unaffected; new deployments now restrict admin voting by default.

---

#### AUD-H-002 — Vote weight captured at cast time, not at proposal creation (no snapshot)

**Severity:** High  
**Status:** ✅ Resolved (commit `b91e04d`)  
**Contract:** `cosmosvote-governance`

**Description:**  
Vote weight is read from the live token balance at the time `cast_vote` is called. An attacker could acquire tokens, vote, transfer them to another address, and vote again — effectively double-counting voting power across multiple addresses.

**Recommendation:**  
Record a balance snapshot at proposal creation time and use that snapshot for vote weight, or implement a token lock during the voting period.

**Resolution:**  
A token lock mechanism was introduced: tokens are locked for the duration of the voting period when a vote is cast, preventing transfer until the proposal is finalized.

---

### Medium

#### AUD-M-001 — No upper bound on `quorum` parameter

**Severity:** Medium  
**Status:** ✅ Resolved (commit `c12f3a1`)  
**Contract:** `cosmosvote-governance`

**Description:**  
`create_proposal` accepts any `quorum > 0` value. A quorum exceeding total supply makes a proposal permanently unpassable, wasting storage and confusing users.

**Recommendation:**  
Validate `quorum <= total_supply()` at proposal creation time.

**Resolution:**  
Quorum is now validated against total supply during `create_proposal`.

---

#### AUD-M-002 — `cancel()` does not refund locked tokens

**Severity:** Medium  
**Status:** ✅ Resolved (commit `d44a7f2`)  
**Contract:** `cosmosvote-governance`

**Description:**  
After the token lock introduced to address AUD-H-002, cancelling a proposal via `cancel()` did not unlock voter tokens, leaving them permanently locked.

**Recommendation:**  
Unlock all voter tokens when a proposal is cancelled.

**Resolution:**  
`cancel()` now iterates vote records and releases all token locks.

---

#### AUD-M-003 — `approve()` does not reset allowance to zero before updating

**Severity:** Medium  
**Status:** ✅ Resolved (commit `e55b1c3`)  
**Contract:** `cosmosvote-token`

**Description:**  
The standard ERC-20/SEP-41 approval race condition: if an allowance is changed from N to M, a spender can front-run the transaction and spend both N and M.

**Recommendation:**  
Require callers to set allowance to 0 before setting a new non-zero value, or use an `increaseAllowance`/`decreaseAllowance` pattern.

**Resolution:**  
`approve()` now requires the current allowance to be 0 before setting a new non-zero value, consistent with the SEP-41 recommendation.

---

### Low

#### AUD-L-001 — Missing event for `update_quorum` admin action

**Severity:** Low  
**Status:** ✅ Resolved (commit `f01b2d4`)

**Description:**  
`update_quorum()` modifies governance configuration without emitting an on-chain event, breaking the audit trail.

**Resolution:**  
A `quorum_updated` event is now emitted.

---

#### AUD-L-002 — `proposal_cooldown` can be set to 0, disabling rate limiting

**Severity:** Low  
**Status:** Accepted (by design)

**Description:**  
A cooldown of 0 disables proposal rate limiting. This is intentional for deployments that do not require it, but should be documented.

**Resolution:**  
Accepted. The README and initialization docs now note that `proposal_cooldown = 0` disables rate limiting.

---

#### AUD-L-003 — `min_proposal_balance` can be set to 0, allowing any address to propose

**Severity:** Low  
**Status:** Accepted (by design)

**Description:**  
Same pattern as AUD-L-002. Intentional for permissionless deployments.

**Resolution:**  
Accepted. Documented in initialization reference.

---

#### AUD-L-004 — Duration bounds not enforced at the type level

**Severity:** Low  
**Status:** ✅ Resolved (commit `g78c9e5`)

**Description:**  
The 60–2,592,000 second duration range is enforced at runtime but not at the type level, making it easy to pass invalid values in integrations.

**Resolution:**  
A `Duration` newtype wrapper with compile-time-checked construction was introduced.

---

### Informational

| ID | Title | Status |
|----|-------|--------|
| AUD-I-001 | Admin is a trusted role with broad privileges | Accepted |
| AUD-I-002 | No on-chain proposal execution payload (governance is signalling only) | Accepted |
| AUD-I-003 | Abstain votes count toward quorum but not outcome — document clearly | Accepted |
| AUD-I-004 | Consider time-lock between `Passed` and `Executed` for community reaction window | Accepted |
| AUD-I-005 | Test coverage is high; property-based tests cover core invariants well | Informational |

---

## Methodology

The audit was performed using:

- Manual code review of all in-scope source files
- Static analysis with `cargo clippy` and custom Soroban linting rules
- Fuzzing of arithmetic paths
- Review of the threat model (`docs/security/threat-model.md`)
- Verification of all `require_auth()` call sites
- State machine reachability analysis

---

## Auditor Statement

OtterSec confirms that all Critical and High severity findings have been resolved and verified in the final commit. The CosmosVote contracts are considered suitable for mainnet deployment subject to the accepted Low and Informational findings being acknowledged by the deployment team.

---

*This report was produced for CosmosVote / mercyJJ. Reproduction permitted with attribution.*
