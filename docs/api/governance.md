# Governance Contract API Reference

Full reference for every public function in the CosmosVote governance contract.

---

## `initialize`

```rust
pub fn initialize(
    env: Env,
    admin: Address,
    voting_token: Address,
    min_proposal_balance: i128,
    proposal_cooldown: u64,
    min_quorum_bps: u32,
    restrict_admin_vote: bool,
) -> Result<(), ContractError>
```

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `admin` | `Address` | Privileged address for execute/cancel/pause operations |
| `voting_token` | `Address` | SEP-41 governance token contract address |
| `min_proposal_balance` | `i128` | Minimum token balance required to create a proposal (`0` = no minimum) |
| `proposal_cooldown` | `u64` | Seconds a proposer must wait between proposals (`0` = no cooldown) |
| `min_quorum_bps` | `u32` | Minimum quorum floor in basis points, e.g. `500` = 5% (`0` = no floor) |
| `restrict_admin_vote` | `bool` | If `true`, admin cannot vote on proposals they created |

**Returns:** `Ok(())` on success.

**Errors:** `AlreadyInitialized (1)` if called more than once.

**Example**

```rust
gov.initialize(
    &admin,
    &token_id,
    &1_000_000i128, // 1M token minimum to propose
    &86_400u64,     // 1-day cooldown
    &500u32,        // 5% quorum floor
    &true,          // admin cannot vote on own proposals
);
```

---

## `get_config`

```rust
pub fn get_config(env: Env) -> GovernanceConfig
```

Returns the current governance configuration as a `GovernanceConfig` struct. This function requires no authentication and is callable by anyone (off-chain monitors, frontends, bots).

**Returns:** `GovernanceConfig`

| Field | Type | Description |
|-------|------|-------------|
| `admin` | `Address` | Current privileged admin address |
| `voting_token` | `Address` | SEP-41 governance token contract address |
| `min_proposal_balance` | `i128` | Minimum token balance required to create a proposal (`0` = no minimum) |
| `proposal_cooldown` | `u64` | Minimum seconds between proposals per address (`0` = no cooldown) |
| `restrict_admin_vote` | `bool` | If `true`, admin cannot vote on own proposals |
| `paused` | `bool` | Whether the contract is currently paused |

**Authentication:** None — this is a read-only query callable without auth.

**Example**

```rust
let config = gov.get_config();
assert_eq!(config.admin, admin_address);
assert_eq!(config.min_proposal_balance, 1_000_000i128);
assert_eq!(config.paused, false);
```

---

## `create_proposal`

```rust
pub fn create_proposal(
    env: Env,
    proposer: Address,
    title: String,
    description: String,
    quorum: i128,
    duration: u64,
) -> Result<u64, ContractError>
```

**Parameters**

| Name | Type | Constraints | Description |
|------|------|-------------|-------------|
| `proposer` | `Address` | Must auth | Address creating the proposal |
| `title` | `String` | 1–128 chars | Short proposal title |
| `description` | `String` | 1–1024 chars | Full proposal description |
| `quorum` | `i128` | `> 0`, `<= total_supply`, `>= floor` | Minimum total votes required to pass |
| `duration` | `u64` | 60–2,592,000 seconds | Voting window length |

**Returns:** `Ok(proposal_id)` — the new proposal's `u64` ID.

**Errors**

| Code | Error | Condition |
|------|-------|-----------|
| 13 | `InvalidTitle` | Title is empty or > 128 chars |
| 14 | `InvalidDescription` | Description is empty or > 1024 chars |
| 15 | `InvalidQuorum` | Quorum ≤ 0 |
| 16 | `QuorumExceedsSupply` | Quorum > total token supply |
| 17 | `InvalidDurationRange` | Duration < 60 or > 2,592,000 |
| 18 | `InsufficientBalance` | Proposer balance < `min_proposal_balance` |
| 19 | `ProposalCooldown` | Proposer is within cooldown window |
| 20 | `QuorumBelowFloor` | Quorum < `min_quorum_bps` floor |
| 40 | `ContractPaused` | Contract is paused |

**Example**

```rust
let id = gov.create_proposal(
    &proposer,
    &String::from_str(&env, "Upgrade to v2"),
    &String::from_str(&env, "Upgrade the protocol to version 2.0"),
    &5_000_000i128,
    &604_800u64, // 7 days
);
```

---

## `get_proposal`

```rust
pub fn get_proposal(env: Env, proposal_id: u64) -> Result<Proposal, ContractError>
```

**Returns:** `Ok(Proposal)` with all proposal fields.

**Errors:** `ProposalNotFound (10)` if the ID does not exist.

---

## `proposal_count`

```rust
pub fn proposal_count(env: Env) -> u64
```

**Returns:** Total number of proposals ever created (monotonically increasing).

---

## `get_proposals`

```rust
pub fn get_proposals(env: Env, from_id: u64, limit: u32) -> Vec<Proposal>
```

Paginated list of proposals. `limit` is capped at 20.

---

## `get_proposals_by_state`

```rust
pub fn get_proposals_by_state(
    env: Env,
    state: ProposalState,
    from_id: u64,
    limit: u32,
) -> Vec<Proposal>
```

Paginated list filtered by `ProposalState`. `limit` is capped at 20.

---

## `cast_vote`

```rust
pub fn cast_vote(
    env: Env,
    voter: Address,
    proposal_id: u64,
    vote: Vote,
) -> Result<(), ContractError>
```

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `voter` | `Address` | Must auth; address casting the vote |
| `proposal_id` | `u64` | Target proposal |
| `vote` | `Vote` | `Vote::Yes`, `Vote::No`, or `Vote::Abstain` |

Vote weight equals the voter's token balance at the proposal's `snapshot_ledger`. Abstain votes count toward quorum but not toward the yes/no outcome.

**Errors**

| Code | Error | Condition |
|------|-------|-----------|
| 10 | `ProposalNotFound` | Proposal ID does not exist |
| 11 | `ProposalNotActive` | Proposal is not in Active state |
| 21 | `VotingNotStarted` | Current time < proposal start time |
| 22 | `VotingPeriodEnded` | Current time > proposal end time |
| 24 | `AlreadyVoted` | Voter has already voted on this proposal |
| 25 | `NoVotingPower` | Voter's balance at snapshot is 0 |
| 26 | `AdminVoteRestricted` | Admin tried to vote on own proposal with `restrict_admin_vote = true` |
| 61 | `MaxVotersReached` | Proposal has reached the `MAX_VOTER_COUNT` (10 000) unique voter limit |

**Example**

```rust
gov.cast_vote(&voter, &proposal_id, &Vote::Yes);
```

---

## `has_voted`

```rust
pub fn has_voted(env: Env, proposal_id: u64, voter: Address) -> bool
```

**Returns:** `true` if the voter has already cast a vote on this proposal.

---

## `get_vote`

```rust
pub fn get_vote(env: Env, proposal_id: u64, voter: Address) -> Result<VoteRecord, ContractError>
```

**Returns:** `Ok(VoteRecord { vote, weight })` for the voter's recorded vote.

**Errors:** `VoteNotFound (27)` if the voter has not voted.

---

## `finalise`

```rust
pub fn finalise(env: Env, proposal_id: u64) -> Result<(), ContractError>
```

Finalizes a proposal after its voting period ends. Anyone may call this.

**Pass conditions:** `total_votes >= quorum AND votes_yes > votes_no`

Ties (`yes == no`) result in rejection.

**Errors**

| Code | Error | Condition |
|------|-------|-----------|
| 10 | `ProposalNotFound` | Proposal ID does not exist |
| 11 | `ProposalNotActive` | Proposal is not in Active state (already finalized/cancelled) |
| 23 | `VotingStillOpen` | Voting period has not ended yet |

**Example**

```rust
gov.finalise(&proposal_id);
```

---

## `execute`

```rust
pub fn execute(env: Env, admin: Address, proposal_id: u64) -> Result<(), ContractError>
```

Marks a `Passed` proposal as `Executed`. Admin only.

**Errors**

| Code | Error | Condition |
|------|-------|-----------|
| 10 | `ProposalNotFound` | Proposal ID does not exist |
| 12 | `ProposalNotPassed` | Proposal is not in Passed state |
| 30 | `NotAdmin` | Caller is not the admin |

---

## `cancel`

```rust
pub fn cancel(env: Env, admin: Address, proposal_id: u64) -> Result<(), ContractError>
```

Cancels an `Active` proposal. Admin only.

**Errors**

| Code | Error | Condition |
|------|-------|-----------|
| 10 | `ProposalNotFound` | Proposal ID does not exist |
| 11 | `ProposalNotActive` | Proposal is not in Active state |
| 30 | `NotAdmin` | Caller is not the admin |

---

## `update_quorum`

```rust
pub fn update_quorum(
    env: Env,
    admin: Address,
    proposal_id: u64,
    new_quorum: i128,
) -> Result<(), ContractError>
```

Updates the quorum on an active proposal. Only allowed before any votes are cast. Admin only.

**Errors:** `QuorumUpdateNotAllowed (32)` if votes have already been cast.

---

## `transfer_admin`

```rust
pub fn transfer_admin(env: Env, admin: Address, new_admin: Address) -> Result<(), ContractError>
```

Initiates a two-step admin transfer. The new admin must call `accept_admin` to complete it.

---

## `accept_admin`

```rust
pub fn accept_admin(env: Env, pending_admin: Address) -> Result<(), ContractError>
```

Completes the admin transfer. Must be called by the pending admin set via `transfer_admin`.

**Errors:** `NoPendingAdmin (33)`, `NotPendingAdmin (34)`

---

## `pause` / `unpause`

```rust
pub fn pause(env: Env, admin: Address) -> Result<(), ContractError>
pub fn unpause(env: Env, admin: Address) -> Result<(), ContractError>
```

Pause or unpause all state-changing operations. Admin only.

**Errors:** `ContractPaused (40)` if already paused; `NotPaused (41)` if already unpaused.

---

## `admin` / `pending_admin` / `version`

```rust
pub fn admin(env: Env) -> Address
pub fn pending_admin(env: Env) -> Option<Address>
pub fn version(env: Env) -> (u32, u32, u32)
```

Read-only accessors for admin address, pending admin (if any), and contract version tuple `(major, minor, patch)`.

---

## Error Code Reference

| Code | Name | Description |
|------|------|-------------|
| 1 | `AlreadyInitialized` | Contract already initialized |
| 2 | `NotInitialized` | Contract not yet initialized |
| 10 | `ProposalNotFound` | Proposal ID does not exist |
| 11 | `ProposalNotActive` | Proposal is not Active |
| 12 | `ProposalNotPassed` | Proposal is not Passed |
| 13 | `InvalidTitle` | Title empty or > 128 chars |
| 14 | `InvalidDescription` | Description empty or > 1024 chars |
| 15 | `InvalidQuorum` | Quorum ≤ 0 |
| 16 | `QuorumExceedsSupply` | Quorum > total supply |
| 17 | `InvalidDurationRange` | Duration out of 60–2,592,000 range |
| 18 | `InsufficientBalance` | Proposer below minimum balance |
| 19 | `ProposalCooldown` | Proposer within cooldown window |
| 20 | `QuorumBelowFloor` | Quorum below `min_quorum_bps` floor |
| 21 | `VotingNotStarted` | Voting period not yet started |
| 22 | `VotingPeriodEnded` | Voting period has ended |
| 23 | `VotingStillOpen` | Voting period still open |
| 24 | `AlreadyVoted` | Voter already voted |
| 25 | `NoVotingPower` | Voter has zero balance at snapshot |
| 26 | `AdminVoteRestricted` | Admin voting on own proposal blocked |
| 27 | `VoteNotFound` | No vote record for this voter |
| 30 | `NotAdmin` | Caller is not admin |
| 31 | `InvalidNewAdmin` | Invalid new admin address |
| 32 | `QuorumUpdateNotAllowed` | Votes already cast |
| 33 | `NoPendingAdmin` | No pending admin transfer |
| 34 | `NotPendingAdmin` | Caller is not the pending admin |
| 40 | `ContractPaused` | Contract is paused |
| 41 | `NotPaused` | Contract is not paused |
| 50 | `ArithmeticOverflow` | Integer overflow |
| 61 | `MaxVotersReached` | Proposal has reached the `MAX_VOTER_COUNT` (10 000) unique voter limit |
