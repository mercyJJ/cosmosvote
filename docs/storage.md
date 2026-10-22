# Storage Model

CosmosVote uses Soroban's three storage tiers strategically to minimize costs.
<!-- . -->

## Tiers

| Tier | Lifetime | Cost | Use Case |
|------|----------|------|----------|
| Instance | Contract lifetime | Cheapest reads | Contract-wide config |
| Persistent | Survives ledger expiry | Medium | Per-proposal / per-voter data |
| Temporary | Expires with ledger TTL | Cheapest writes | Short-lived allowances |

## Governance Contract

### Instance Storage

| Key | Type | Notes |
|-----|------|-------|
| `Admin` | `Address` | Set once at init |
| `PendingAdmin` | `Address` | Pending two-step transfer |
| `VotingToken` | `Address` | Set once at init |
| `MinProposalBalance` | `i128` | 0 = no minimum |
| `ProposalCooldown` | `u64` | 0 = no cooldown |
| `RestrictAdminVote` | `bool` | — |
| `Paused` | `bool` | — |
| `ContractState` | `ContractState` | Uninitialized / Ready |
| `Version` | `(u32, u32, u32)` | Semantic version |

### Persistent Storage

| Key | Type | Notes |
|-----|------|-------|
| `ProposalCount` | `u64` | Moved from Instance to avoid contention |
| `Proposal(id)` | `Proposal` | Full proposal state |
| `HasVoted(id, voter)` | `bool` | Double-vote guard |
| `VoteRecord(id, voter)` | `VoteRecord` | Vote type + weight |
| `LastProposal(proposer)` | `u64` | Cooldown timestamp |

## Token Contract

### Instance Storage

| Key | Type | Notes |
|-----|------|-------|
| `Admin` | `Address` | — |
| `PendingAdmin` | `Address` | Pending two-step transfer |
| `TotalSupply` | `i128` | Aggregate supply |
| `Initialized` | `bool` | Init guard |
| `Version` | `(u32, u32, u32)` | — |

### Persistent Storage

| Key | Type | Notes |
|-----|------|-------|
| `Balance(owner)` | `i128` | Per-address balance |

### Temporary Storage

| Key | Type | Notes |
|-----|------|-------|
| `Allowance(owner, spender)` | `Allowance { amount: i128, expiry_ledger: u32 }` | Expires after `expiry_ledger`, with TTL bumped on allowance reads and writes |

## Rationale

Instance storage is loaded once per contract invocation at a fixed cost, making it ideal for frequently-read config. Persistent storage survives ledger expiry independently, ensuring proposal and vote data is never lost. Temporary storage is used for allowances because they are short-lived by design and do not need to survive ledger expiry.

## Storage TTL Extension (Persistent Keys)

Soroban persistent storage entries carry a TTL that decrements each ledger. If a TTL reaches zero without being bumped, the entry is archived and effectively lost. CosmosVote extends the TTL on **every read and write** to persistent storage so that entries remain live for the full expected lifecycle.

| Key | TTL (ledgers) | Rationale |
|-----|--------------|-----------|
| `Proposal(id)` | 518 400 (~30 days at 5 s/ledger) | Covers max voting duration (2 592 000 s) plus buffer |
| `HasVoted(id, voter)` | 518 400 | Vote guards must outlive the proposal |
| `VoteRecord(id, voter)` | 518 400 | Vote records must outlive the proposal |
| `LastProposal(proposer)` | 120 960 (~7 days) | Only needs to cover the cooldown window |

### TTL Refresh in cast_vote

Every call to `cast_vote` refreshes the TTL for:

1. **`Proposal(id)`** — via `GovernanceStorage::set_proposal()` after tallying the vote weight. TTL is bumped to `PROPOSAL_TTL_LEDGERS` (518 400 ledgers ≈ 30 days).
2. **`HasVoted(id, voter)`** — via `GovernanceStorage::set_has_voted()` after recording the vote. TTL bumped to `VOTE_TTL_LEDGERS` (518 400 ledgers).
3. **`VoteRecord(id, voter)`** — via `GovernanceStorage::set_vote_record()` after recording vote details. TTL bumped to `VOTE_TTL_LEDGERS`.

### TTL Refresh in finalise

`finalise()` writes the updated `Proposal` state (Passed/Rejected) via `GovernanceStorage::set_proposal()`, which bumps the **`Proposal(id)`** TTL to `PROPOSAL_TTL_LEDGERS`. This ensures the final proposal state remains readable long after voting ends.

### Implementation Details

TTL bumping is centralized in `GovernanceStorage::bump_persistent_ttl()`:

```rust
fn bump_persistent_ttl(env: &Env, key: &PersistentKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, Self::PERSISTENT_THRESHOLD, Self::PERSISTENT_BUMP_AMOUNT);
}
```

- `PERSISTENT_THRESHOLD` = 17 280 ledgers (~1 day): only bump if the remaining TTL falls below this threshold, avoiding unnecessary fee payments when TTL is still healthy.
- `PERSISTENT_BUMP_AMOUNT` = 518 400 ledgers (~30 days): the target TTL after bumping.

### Assumptions

* Average ledger close time: **5 seconds**. If the network is slower, TTLs cover proportionally less wall-clock time.
* TTL is bumped on **both read and write**. The read bump uses `extend_ttl` with the threshold guard so a busy proposal (many voters) automatically stays alive without operator intervention.
* Archived entries can be restored via Soroban's `RestoreFootprint` operation — bump fees are cheaper than restoration fees, so proactive extension on every access is the preferred strategy.
* On **testnet**, ledger TTL limits may differ from mainnet. Always verify `max_entry_ttl` on the target network before deployment.

### Mainnet vs. Testnet TTL Limits (as of 2026)

| Network | `max_entry_ttl` (ledgers) | Equivalent wall-clock time |
|---------|--------------------------|---------------------------|
| Mainnet | 3 110 400 | ~180 days at 5 s/ledger |
| Testnet | 3 110 400 | ~180 days at 5 s/ledger |

Our `PROPOSAL_TTL_LEDGERS` (518 400) is well within the mainnet limit, leaving ample headroom.
