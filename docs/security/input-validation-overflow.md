# Input Validation & Overflow Prevention

_Relates to issue [#367](https://github.com/mercyJJ/cosmosvote/issues/367)._

---

## Input Validation Guards

Every public entry point in the governance and token contracts validates its
inputs before mutating state. The table below summarises the checks applied at
the contract level.

### `create_proposal`

| Parameter | Constraint | Error |
|-----------|-----------|-------|
| `title` | 1–128 chars | `InvalidTitle` |
| `description` | 1–1024 chars | `InvalidDescription` |
| `quorum` | > 0 and ≤ total supply | `InvalidQuorum` / `QuorumExceedsSupply` |
| `duration` | 60–2 592 000 seconds | `InvalidDurationRange` |
| `link` | URL length ≤ 256 chars (if provided) | `InvalidLink` |

### `cast_vote`

| Condition | Error |
|-----------|-------|
| Voting period has ended | `VotingPeriodEnded` |
| Voter already voted | `AlreadyVoted` |
| Voter balance is zero | `NoVotingPower` |
| Admin voting on own proposal with restriction enabled | `AdminVoteRestricted` |
| Contract is paused | `ContractPaused` |

### Token `mint` / `transfer` / `burn`

| Condition | Error |
|-----------|-------|
| Amount ≤ 0 | `InvalidAmount` |
| Sender balance < amount | `InsufficientBalance` |
| Result would exceed `i128::MAX` | `ArithmeticOverflow` |

---

## Arithmetic Overflow Prevention

All arithmetic that accumulates vote tallies or token balances uses Rust's
checked operations to prevent silent wrapping.

### Token contract

```rust
// mint — prevents total supply exceeding i128::MAX
let new_supply = supply
    .checked_add(amount)
    .ok_or(ContractError::ArithmeticOverflow)?;
```

Relevant code: `contracts/token/src/lib.rs` — `mint()`.

### Governance contract

Vote tallies (`votes_yes`, `votes_no`, `votes_abstain`) are accumulated using
`checked_add`. Because each voter's weight is bounded by their token balance,
and all balances are bounded by `total_supply ≤ i128::MAX`, overflow in vote
tallies is impossible for any valid token supply. The guard is present
defensively:

```rust
proposal.votes_yes = proposal.votes_yes
    .checked_add(weight)
    .ok_or(ContractError::ArithmeticOverflow)?;
```

Relevant code: `contracts/governance/src/lib.rs` — `cast_vote()`.

---

## Test Coverage

New tests added in `contracts/governance/src/validation_tests.rs`:

| Test | What it covers |
|------|---------------|
| `test_create_proposal_empty_title_rejected` | Empty title → `InvalidTitle` |
| `test_create_proposal_title_too_long_rejected` | 129-char title → `InvalidTitle` |
| `test_create_proposal_empty_description_rejected` | Empty description → `InvalidDescription` |
| `test_create_proposal_description_too_long_rejected` | 1025-char description → `InvalidDescription` |
| `test_create_proposal_zero_quorum_rejected` | Zero quorum → `InvalidQuorum` |
| `test_create_proposal_negative_quorum_rejected` | Negative quorum → `InvalidQuorum` |
| `test_create_proposal_quorum_exceeds_supply_rejected` | Quorum > supply → `QuorumExceedsSupply` |
| `test_create_proposal_duration_too_short_rejected` | Duration < 60 s → `InvalidDurationRange` |
| `test_create_proposal_duration_too_long_rejected` | Duration > 30 d → `InvalidDurationRange` |
| `test_cast_vote_double_vote_rejected` | Second vote → `AlreadyVoted` |
| `test_cast_vote_no_balance_rejected` | Zero-balance voter → `NoVotingPower` |
| `test_token_mint_overflow_rejected` | Mint past `i128::MAX` → `ArithmeticOverflow` |
| `test_token_transfer_zero_amount_rejected` | Zero transfer → error |
| `test_token_transfer_negative_amount_rejected` | Negative transfer → error |

Run with:

```bash
cargo test -p cosmosvote-governance validation_tests
```
