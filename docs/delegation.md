# Vote Delegation

CosmosVote supports **simple (liquid democracy-style) delegation**: a token holder can delegate their voting power to a trusted representative without transferring their tokens.

---

## Model

- **One-level delegation only** — A delegates to B. B votes with their own balance. A cannot vote while delegated.
- **Tokens stay in the owner's wallet** — delegation is a separate on-chain record; balances are unaffected.
- **One active delegation at a time** — an owner must `undelegate` before delegating to a different address.
- **Delegate votes with their own balance** — the governance contract uses `get_delegated_weight(voter, delegators)` to accumulate weight. Since Soroban has no reverse-lookup, the caller must supply the list of delegators. For the current on-chain flow, each voter's weight equals their own balance; off-chain indexers can supply delegator lists for richer weight calculation.

---

## Token Contract API

### `delegate(owner, delegate_to) → Result<(), ContractError>`

Delegates `owner`'s voting power to `delegate_to`.

- `owner` must sign (`require_auth`)
- `owner != delegate_to` (cannot delegate to self)
- `owner` must not already have an active delegation

**Errors:** `CannotDelegateSelf` (30), `AlreadyDelegating` (31)

### `undelegate(owner) → Result<(), ContractError>`

Removes the active delegation, restoring `owner`'s direct voting power.

- `owner` must sign (`require_auth`)
- `owner` must have an active delegation

**Errors:** `NotDelegating` (32)

### `get_delegation(owner) → Option<Address>`

Returns the current delegate for `owner`, or `None` if not delegating.

### `get_delegated_weight(voter, delegators: Vec<Address>) → i128`

Returns `voter`'s own balance plus the balances of any `delegators` who have delegated to `voter`. Delegators whose stored delegate does not match `voter` are ignored.

**How it is called:**

The governance contract calls `get_delegated_weight(voter, [])` (empty delegator list) during `cast_vote`, so the on-chain voting weight equals the voter's own balance only. To credit delegated weight from known delegators, an off-chain indexer or keeper can supply the full delegator list:

```rust
// On-chain (inside governance.cast_vote) — own balance only:
let weight = token.get_delegated_weight(&voter, &vec![&env]);

// Off-chain keeper / frontend — includes delegated weight:
let delegators = vec![alice, carol];        // addresses that delegated to Bob
let weight = token.get_delegated_weight(&bob, &delegators);
// weight = bob.balance + alice.balance + carol.balance
```

---

## Governance Behavior

- **Delegators cannot vote directly.** If `voter` has an active delegation, `cast_vote` returns `NoVotingPower`.
- **Delegates vote with their own balance.** The governance contract calls `get_delegated_weight(voter, [])` (empty delegator list), so the weight equals the voter's own balance. To include delegated weight, an off-chain caller can supply the delegator list.
- **Undelegating restores voting power** immediately for future proposals.

---

## Worked Examples

### Example 1 — Basic delegation and voting

Alice holds 10 M VOTE tokens and wants Bob (who has 5 M) to vote on her behalf.

```
Initial state:
  Alice: 10,000,000 VOTE, no active delegation
  Bob:    5,000,000 VOTE, no active delegation

Step 1: Alice delegates to Bob
  token.delegate(&alice, &bob)   → Ok(())
  get_delegation(&alice)         → Some(bob)

Step 2: A proposal is created. Bob votes Yes.
  governance.cast_vote(&bob, proposal_id, Vote::Yes)
  → Bob's on-chain weight = 5,000,000  (own balance, delegator list is [])

Step 3: Alice attempts to vote on the same proposal.
  governance.cast_vote(&alice, proposal_id, Vote::No)
  → Err(NoVotingPower)  ← Alice has an active delegation
```

### Example 2 — Undelegating and voting directly

Continuing from Example 1, Alice wants to vote on a new proposal herself.

```
Step 4: Alice undelegates.
  token.undelegate(&alice)       → Ok(())
  get_delegation(&alice)         → None

Step 5: A new proposal is created. Alice votes directly.
  governance.cast_vote(&alice, proposal_id_2, Vote::Yes)
  → Alice's weight = 10,000,000  (own balance restored)
```

### Example 3 — Off-chain full delegated weight

An off-chain indexer supplies the delegator list to compute full voting power.

```
State:
  Bob:    5,000,000 VOTE
  Alice: 10,000,000 VOTE, delegated to Bob
  Carol:  3,000,000 VOTE, delegated to Bob

Off-chain call (not executed on-chain by default):
  token.get_delegated_weight(&bob, vec![alice, carol])
  → 5,000,000 + 10,000,000 + 3,000,000 = 18,000,000
```

> **On-chain note:** The governance contract currently supplies an **empty** delegator list, so Bob's on-chain vote weight is 5,000,000 regardless of how many addresses have delegated to him. The off-chain computation above is informational only.

### Example 4 — Changing delegate (requires undelegation first)

```
Alice delegates to Bob:
  token.delegate(&alice, &bob)   → Ok(())

Alice wants to delegate to Carol instead:
  token.delegate(&alice, &carol) → Err(AlreadyDelegating)  ← must undelegate first

Alice undelegates, then re-delegates:
  token.undelegate(&alice)       → Ok(())
  token.delegate(&alice, &carol) → Ok(())
  get_delegation(&alice)         → Some(carol)
```

---

## Edge Cases

### Self-delegation is rejected

An owner cannot delegate to themselves. This prevents a no-op that would waste gas and confuse vote-weight logic.

```
token.delegate(&alice, &alice)   → Err(CannotDelegateSelf)  // error code 30
```

### Undelegating when not delegating

Calling `undelegate` with no active delegation fails cleanly.

```
token.undelegate(&alice)         → Err(NotDelegating)  // error code 32
```

### Delegating when already delegating

An owner with an active delegation must call `undelegate` first; a second `delegate` call is rejected.

```
token.delegate(&alice, &bob)     → Ok(())
token.delegate(&alice, &carol)   → Err(AlreadyDelegating)  // error code 31
```

### Delegating to an address with zero balance

Delegation succeeds even if the delegate has zero tokens. The delegator's voting power is silenced but the delegate's on-chain weight remains zero until they acquire tokens.

### Delegation to a non-existent address

No check is performed on whether the delegate address has ever interacted with the contract. The delegation is stored as-is.

### Proposals created before undelegation

If Alice delegated before a proposal was created, she cannot vote on that proposal even after undelegating, because `cast_vote` reads the delegation state **at vote time**. Undelegating restores voting power only for future votes.

---

## Cycle Detection

`delegate()` detects and rejects **direct delegation cycles** (A→B, B→A):

- If A delegates to B, any subsequent attempt by B to delegate back to A
  returns `DelegationCycle` (error code 33).
- Self-delegation (A→A) continues to return `CannotDelegateSelf` (error code 30).

```
Alice delegates to Bob  → Ok
Bob delegates to Alice  → Err(DelegationCycle)  ← rejected
```

**Multi-hop delegation is not supported.** The contract stores a single
delegation target per address. `get_delegated_weight` accepts an explicit
`delegators` list controlled by the caller and accumulates weight one level
deep only. Callers must not supply cyclic delegator lists to
`get_delegated_weight`.

**Why only direct cycles?** The contract does not walk the full delegation
graph on every `delegate()` call (that would be O(n) storage reads). Only the
immediate reverse link is checked. Multi-hop cycles (A→B→C→A) are not
detected on-chain; callers building delegator lists off-chain must ensure they
don't supply circular inputs to `get_delegated_weight`.

---

## Delegated vs. Non-Delegated Voting — Comparison

| Attribute | Non-delegated voter | Delegated voter | Delegate (recipient of delegation) |
|-----------|--------------------|-----------------|------------------------------------|
| Can vote directly? | ✅ Yes | ❌ No (`NoVotingPower`) | ✅ Yes |
| Voting weight (on-chain) | Own balance | — (cannot vote) | Own balance (delegator list = []) |
| Voting weight (off-chain, full list) | Own balance | — (cannot vote) | Own + all delegators' balances |
| Tokens transferred? | No | No | No |
| Can hold tokens? | Yes | Yes | Yes |
| Can create proposals? | Yes (if balance ≥ min) | Yes (if balance ≥ min) | Yes (if balance ≥ min) |
| Effect of undelegating | — | Restores direct voting power immediately | Delegation record removed; no effect on delegate's own balance |
| Cycle prevention | n/a | Direct cycle check on delegate() | Same |

---

## Events

| Event topic | Data | Description |
|-------------|------|-------------|
| `(token, delegate)` | `(owner, delegate_to)` | Delegation created |
| `(token, undelegt)` | `owner` | Delegation removed |

---

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| 30 | `CannotDelegateSelf` | Owner tried to delegate to themselves |
| 31 | `AlreadyDelegating` | Owner already has an active delegation |
| 32 | `NotDelegating` | Undelegate called with no active delegation |
| 33 | `DelegationCycle` | Delegation would create a direct cycle (A→B, B→A) |

---

## See Also

- [docs/api/token.md](./api/token.md) — Full token contract API reference including `delegate`, `undelegate`, `get_delegation`, `get_delegated_weight`
- [docs/api/governance.md](./api/governance.md) — Governance contract API reference including `cast_vote`
- [README.md](../README.md#vote-delegation) — Quick overview of vote delegation
