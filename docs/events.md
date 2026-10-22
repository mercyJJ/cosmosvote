# On-Chain Event Schema

Both CosmosVote contracts emit Soroban events on every state transition. This document is the authoritative reference for off-chain indexers, explorers, and frontend consumers.

## Encoding

Soroban events are published via `env.events().publish(topics, data)`.

- **Topics** — a tuple of `Symbol` values, always `(contract_tag, event_tag)`.
- **Data** — a tuple (or scalar) of typed values encoded as XDR `ScVal`.
- **Addresses** — `ScVal::Address` (Stellar `G…` or contract `C…` strkey).
- **Integers** — `i128` encoded as `ScVal::I128`, `u64` as `ScVal::U64`, `u32` as `ScVal::U32`.
- **Strings** — `ScVal::String`.
- **Enums** — `ScVal::Vec` with a single `ScVal::Symbol` discriminant (e.g., `["Yes"]`).

---

## Governance Contract

Contract tag: **`gov`**

### `initialized`

Emitted once when the governance contract is first set up.

| Field | Topic index | Type | Description |
|-------|-------------|------|-------------|
| contract_tag | 0 | Symbol | `"gov"` |
| event_tag | 1 | Symbol | `"init"` |

| Field | Data index | Type | Description |
|-------|------------|------|-------------|
| admin | 0 | Address | Initial admin address |
| token | 1 | Address | Governance token contract address |

```json
{
  "topics": ["gov", "init"],
  "data": ["GABC...ADMIN", "CABC...TOKEN"]
}
```

---

### `proposal_created`

Emitted when a new proposal is submitted.

| Field | Topic index | Type | Description |
|-------|-------------|------|-------------|
| contract_tag | 0 | Symbol | `"gov"` |
| event_tag | 1 | Symbol | `"created"` |

| Field | Data index | Type | Description |
|-------|------------|------|-------------|
| id | 0 | u64 | Monotonically increasing proposal ID |
| proposer | 1 | Address | Address that created the proposal |
| title | 2 | String | Proposal title (1–128 chars) |
| quorum | 3 | i128 | Minimum votes required for validity |
| end_time | 4 | u64 | Unix timestamp when voting closes |

```json
{
  "topics": ["gov", "created"],
  "data": [1, "GABC...PROPOSER", "Increase treasury allocation", 1000000, 1748700000]
}
```

---

### `vote_cast`

Emitted each time an address casts a vote.

| Field | Topic index | Type | Description |
|-------|-------------|------|-------------|
| contract_tag | 0 | Symbol | `"gov"` |
| event_tag | 1 | Symbol | `"voted"` |

| Field | Data index | Type | Description |
|-------|------------|------|-------------|
| proposal_id | 0 | u64 | Target proposal ID |
| voter | 1 | Address | Voter's address |
| vote | 2 | Enum | `"Yes"` \| `"No"` \| `"Abstain"` |
| weight | 3 | i128 | Token balance used as vote weight |

```json
{
  "topics": ["gov", "voted"],
  "data": [1, "GABC...VOTER", ["Yes"], 5000000]
}
```

---

### `proposal_finalized`

Emitted when a proposal's voting period ends and its outcome is recorded.

| Field | Topic index | Type | Description |
|-------|-------------|------|-------------|
| contract_tag | 0 | Symbol | `"gov"` |
| event_tag | 1 | Symbol | `"final"` |

| Field | Data index | Type | Description |
|-------|------------|------|-------------|
| proposal_id | 0 | u64 | Finalized proposal ID |
| state | 1 | Enum | `"Passed"` \| `"Rejected"` |

```json
{
  "topics": ["gov", "final"],
  "data": [1, ["Passed"]]
}
```

---

### `proposal_executed`

Emitted when a passed proposal is executed by the admin.

| Field | Topic index | Type | Description |
|-------|-------------|------|-------------|
| contract_tag | 0 | Symbol | `"gov"` |
| event_tag | 1 | Symbol | `"exec"` |

| Field | Data index | Type | Description |
|-------|------------|------|-------------|
| proposal_id | 0 | u64 | Executed proposal ID |
| admin | 1 | Address | Admin that triggered execution |

```json
{
  "topics": ["gov", "exec"],
  "data": [1, "GABC...ADMIN"]
}
```

---

### `proposal_cancelled`

Emitted when the admin cancels an active proposal.

| Field | Topic index | Type | Description |
|-------|-------------|------|-------------|
| contract_tag | 0 | Symbol | `"gov"` |
| event_tag | 1 | Symbol | `"cancel"` |

| Field | Data index | Type | Description |
|-------|------------|------|-------------|
| proposal_id | 0 | u64 | Cancelled proposal ID |
| admin | 1 | Address | Admin that cancelled |
| voter_count | 2 | u32 | Number of votes cast at time of cancellation |
| reason | 3 | String | Cancellation reason (empty string if none provided) |

```json
{
  "topics": ["gov", "cancel"],
  "data": [1, "GABC...ADMIN", 42, "Duplicate proposal"]
}
```

---

### `quorum_updated`

Emitted when the quorum threshold for a proposal is changed.

| Field | Topic index | Type | Description |
|-------|-------------|------|-------------|
| contract_tag | 0 | Symbol | `"gov"` |
| event_tag | 1 | Symbol | `"quorum"` |

| Field | Data index | Type | Description |
|-------|------------|------|-------------|
| proposal_id | 0 | u64 | Affected proposal ID |
| old_quorum | 1 | i128 | Previous quorum value |
| new_quorum | 2 | i128 | Updated quorum value |

```json
{
  "topics": ["gov", "quorum"],
  "data": [1, 1000000, 2000000]
}
```

---

### `admin_transfer_proposed`

Emitted when the current admin nominates a pending admin via `propose_admin`
(the first step of the two-step admin transfer). The payload includes the
ledger timestamp so off-chain monitors can order transfers without relying on
ledger sequence alone.

| Field | Topic index | Type | Description |
|-------|-------------|------|-------------|
| contract_tag | 0 | Symbol | `"gov"` |
| event_tag | 1 | Symbol | `"propose"` |

| Field | Data index | Type | Description |
|-------|------------|------|-------------|
| current_admin | 0 | Address | Existing admin initiating the transfer |
| pending_admin | 1 | Address | Nominated successor |
| timestamp | 2 | u64 | Ledger timestamp when the transfer was initiated |

```json
{
  "topics": ["gov", "propose"],
  "data": ["GABC...OLD", "GABC...NEW", 1700000000]
}
```

---

### `admin_transfer_accepted`

Emitted when the pending admin calls `accept_admin` and the transfer completes
(the second and final step of the two-step admin transfer).

| Field | Topic index | Type | Description |
|-------|-------------|------|-------------|
| contract_tag | 0 | Symbol | `"gov"` |
| event_tag | 1 | Symbol | `"accept"` |

| Field | Data index | Type | Description |
|-------|------------|------|-------------|
| previous_admin | 0 | Address | Former admin |
| new_admin | 1 | Address | New admin that accepted |
| timestamp | 2 | u64 | Ledger timestamp when the transfer was accepted |

```json
{
  "topics": ["gov", "accept"],
  "data": ["GABC...OLD", "GABC...NEW", 1700003600]
}
```

---

### `admin_transferred` (direct)

Emitted on an immediate (single-step) admin transfer.

| Field | Topic index | Type | Description |
|-------|-------------|------|-------------|
| contract_tag | 0 | Symbol | `"gov"` |
| event_tag | 1 | Symbol | `"admin"` |

| Field | Data index | Type | Description |
|-------|------------|------|-------------|
| old_admin | 0 | Address | Previous admin |
| new_admin | 1 | Address | New admin |

```json
{
  "topics": ["gov", "admin"],
  "data": ["GABC...OLD", "GABC...NEW"]
}
```

---

### `paused`

Emitted when the admin pauses the contract.

| Field | Topic index | Type | Description |
|-------|-------------|------|-------------|
| contract_tag | 0 | Symbol | `"gov"` |
| event_tag | 1 | Symbol | `"paused"` |

| Field | Data index | Type | Description |
|-------|------------|------|-------------|
| admin | — | Address | Admin that paused (scalar, not tuple) |

```json
{
  "topics": ["gov", "paused"],
  "data": "GABC...ADMIN"
}
```

---

### `unpaused`

Emitted when the admin resumes the contract.

| Field | Topic index | Type | Description |
|-------|-------------|------|-------------|
| contract_tag | 0 | Symbol | `"gov"` |
| event_tag | 1 | Symbol | `"unpause"` |

| Field | Data index | Type | Description |
|-------|------------|------|-------------|
| admin | — | Address | Admin that unpaused (scalar, not tuple) |

```json
{
  "topics": ["gov", "unpause"],
  "data": "GABC...ADMIN"
}
```

---

## Token Contract

Contract tag: **`token`**

### `initialized`

Emitted once when the token contract is deployed and configured.

| Field | Topic index | Type | Description |
|-------|-------------|------|-------------|
| contract_tag | 0 | Symbol | `"token"` |
| event_tag | 1 | Symbol | `"init"` |

| Field | Data index | Type | Description |
|-------|------------|------|-------------|
| admin | 0 | Address | Admin / initial supply recipient |
| supply | 1 | i128 | Total tokens minted at init |

```json
{
  "topics": ["token", "init"],
  "data": ["GABC...ADMIN", 1000000000]
}
```

---

### `transfer`

Emitted on every token transfer (including `transfer_from`).

| Field | Topic index | Type | Description |
|-------|-------------|------|-------------|
| contract_tag | 0 | Symbol | `"token"` |
| event_tag | 1 | Symbol | `"xfer"` |

| Field | Data index | Type | Description |
|-------|------------|------|-------------|
| from | 0 | Address | Sender |
| to | 1 | Address | Recipient |
| amount | 2 | i128 | Token amount transferred |

```json
{
  "topics": ["token", "xfer"],
  "data": ["GABC...FROM", "GABC...TO", 500000]
}
```

---

### `approval`

Emitted when a spender allowance is set.

| Field | Topic index | Type | Description |
|-------|-------------|------|-------------|
| contract_tag | 0 | Symbol | `"token"` |
| event_tag | 1 | Symbol | `"approve"` |

| Field | Data index | Type | Description |
|-------|------------|------|-------------|
| owner | 0 | Address | Token owner granting allowance |
| spender | 1 | Address | Approved spender |
| amount | 2 | i128 | Approved amount |

```json
{
  "topics": ["token", "approve"],
  "data": ["GABC...OWNER", "GABC...SPENDER", 100000]
}
```

---

### `minted`

Emitted when the admin mints new tokens.

| Field | Topic index | Type | Description |
|-------|-------------|------|-------------|
| contract_tag | 0 | Symbol | `"token"` |
| event_tag | 1 | Symbol | `"mint"` |

| Field | Data index | Type | Description |
|-------|------------|------|-------------|
| admin | 0 | Address | Admin that minted |
| to | 1 | Address | Recipient of minted tokens |
| amount | 2 | i128 | Amount minted |

```json
{
  "topics": ["token", "mint"],
  "data": ["GABC...ADMIN", "GABC...RECIPIENT", 250000]
}
```

---

### `burned`

Emitted when tokens are burned (by admin or by owner via `burn_self`).

| Field | Topic index | Type | Description |
|-------|-------------|------|-------------|
| contract_tag | 0 | Symbol | `"token"` |
| event_tag | 1 | Symbol | `"burn"` |

| Field | Data index | Type | Description |
|-------|------------|------|-------------|
| admin | 0 | Address | Admin (or owner for `burn_self`) |
| from | 1 | Address | Account tokens are burned from |
| amount | 2 | i128 | Amount burned |

```json
{
  "topics": ["token", "burn"],
  "data": ["GABC...ADMIN", "GABC...FROM", 100000]
}
```

---

### `admin_transferred`

Emitted when the token admin is changed.

| Field | Topic index | Type | Description |
|-------|-------------|------|-------------|
| contract_tag | 0 | Symbol | `"token"` |
| event_tag | 1 | Symbol | `"admin"` |

| Field | Data index | Type | Description |
|-------|------------|------|-------------|
| old_admin | 0 | Address | Previous admin |
| new_admin | 1 | Address | New admin |

```json
{
  "topics": ["token", "admin"],
  "data": ["GABC...OLD", "GABC...NEW"]
}
```

---

## Quick Reference

| Contract | Event | Topics | Data fields |
|----------|-------|--------|-------------|
| gov | initialized | `gov`, `init` | admin, token |
| gov | proposal_created | `gov`, `created` | id, proposer, title, quorum, end_time |
| gov | vote_cast | `gov`, `voted` | proposal_id, voter, vote, weight |
| gov | proposal_finalized | `gov`, `final` | proposal_id, state |
| gov | proposal_executed | `gov`, `exec` | proposal_id, admin |
| gov | proposal_cancelled | `gov`, `cancel` | proposal_id, admin, voter_count, reason |
| gov | quorum_updated | `gov`, `quorum` | proposal_id, old_quorum, new_quorum |
| gov | admin_transfer_proposed | `gov`, `propose` | current_admin, pending_admin, timestamp |
| gov | admin_transfer_accepted | `gov`, `accept` | previous_admin, new_admin, timestamp |
| gov | admin_transferred | `gov`, `admin` | old_admin, new_admin |
| gov | paused | `gov`, `paused` | admin |
| gov | unpaused | `gov`, `unpause` | admin |
| token | initialized | `token`, `init` | admin, supply |
| token | transfer | `token`, `xfer` | from, to, amount |
| token | approval | `token`, `approve` | owner, spender, amount |
| token | minted | `token`, `mint` | admin, to, amount |
| token | burned | `token`, `burn` | admin, from, amount |
| token | admin_transferred | `token`, `admin` | old_admin, new_admin |
