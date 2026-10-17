# Gas Budgeting for CosmosVote Contracts

Soroban does not use a "gas" model like Ethereum. Instead, it charges fees based on **CPU instruction counts** and **memory (byte) usage**, both measured per transaction. This document describes the budget model, provides measured estimates for every public method, and gives deployment recommendations.

---

## Soroban Resource Model

| Resource | Default Limit | Unit |
|----------|--------------|------|
| CPU instructions | 100,000,000 | instructions/tx |
| Memory | 40,971,520 | bytes/tx |
| Read ledger entries | 40 | entries/tx |
| Write ledger entries | 25 | entries/tx |
| Read bytes | 200,000 | bytes/tx |
| Write bytes | 66,560 | bytes/tx |
| Events | 3 | topics×32 bytes |
| Transaction size | 71,680 | bytes |

All CosmosVote governance operations consume well under these limits individually. When batching or composing calls, monitor cumulative usage.

---

## Governance Contract — Estimated Budgets

Measurements use `env.budget().cpu_instruction_cost()` in the Soroban test harness (see `contracts/governance/src/benchmarks.rs`). Real-network costs may vary slightly with ledger state.

| Method | Est. CPU Instructions | Ledger Reads | Ledger Writes | Notes |
|--------|----------------------|-------------|--------------|-------|
| `initialize` | ~3,000,000 | 1 | 10 | Writes all config keys to instance storage |
| `create_proposal` | ~5,000,000 | 4 | 4 | Reads token supply + balance; writes proposal + counts |
| `cast_vote` | ~5,000,000 | 4 | 4 | Cross-contract call to token for weight; writes vote record |
| `retract_vote` | ~4,000,000 | 4 | 3 | Reads + updates proposal totals; removes vote record |
| `change_vote` | ~5,000,000 | 4 | 3 | Similar to cast_vote with extra read |
| `finalise` | ~2,000,000 | 2 | 2 | Pure arithmetic on proposal totals; no cross-contract call |
| `execute` | ~2,500,000 | 2 | 1 | Optional treasury cross-contract call adds ~2,000,000 |
| `cancel` | ~2,000,000 | 2 | 2 | Writes proposal state + active count |
| `amend_proposal` | ~2,500,000 | 2 | 1 | Validates and rewrites proposal fields |
| `update_quorum` | ~3,000,000 | 3 | 1 | Reads token supply; time-lock check |
| `propose_admin` | ~1,500,000 | 2 | 1 | Writes pending admin to instance storage |
| `accept_admin` | ~1,500,000 | 2 | 2 | Swaps admin + clears pending admin |
| `cancel_admin_transfer` | ~1,500,000 | 2 | 1 | Clears pending admin |
| `update_voting_token` | ~2,000,000 | 2 | 1 | Checks no active proposals first |
| `pause` / `unpause` | ~1,000,000 | 2 | 1 | Single flag write |
| `upgrade` | ~1,500,000 | 1 | 1 | Deploys new WASM hash |
| `get_proposal` | ~500,000 | 1 | 0 | Read-only |
| `get_proposals` | ~500,000–2,000,000 | 1–20 | 0 | Scales with `limit` (max 20) |
| `has_voted` | ~300,000 | 1 | 0 | Read-only |
| `get_vote` | ~400,000 | 1 | 0 | Read-only |
| `get_config` | ~300,000 | 6 | 0 | Reads all instance config keys |
| `admin` / `pending_admin` | ~200,000 | 1 | 0 | Read-only |

> **Note:** `cast_vote` is the most expensive operation because it performs a cross-contract call to the token contract to retrieve the voter's delegated weight. Each cross-contract call consumes roughly 2–3M additional instructions.

---

## Token Contract — Estimated Budgets

| Method | Est. CPU Instructions | Ledger Reads | Ledger Writes |
|--------|----------------------|-------------|--------------|
| `initialize` | ~2,000,000 | 1 | 6 |
| `transfer` | ~3,000,000 | 2 | 2 |
| `mint` | ~2,500,000 | 2 | 2 |
| `burn` / `burn_self` | ~2,500,000 | 2 | 2 |
| `approve` | ~2,000,000 | 1 | 1 |
| `transfer_from` | ~3,500,000 | 3 | 2 |
| `delegate` | ~2,000,000 | 1 | 1 |
| `undelegate` | ~1,500,000 | 1 | 1 |
| `get_delegated_weight` | ~2,000,000 | 2 | 0 |
| `balance` | ~500,000 | 1 | 0 |
| `total_supply` | ~300,000 | 1 | 0 |
| `name` / `symbol` / `decimals` | ~200,000 | 1 | 0 |

---

## Storage Costs

Soroban charges for **writing bytes** to the ledger. Estimate storage costs based on the serialised size of each entry:

| Entry | Approximate Size | Storage Tier |
|-------|-----------------|-------------|
| `Admin`, `VotingToken` | ~40 bytes each | Instance |
| `Proposal` struct | ~300–500 bytes | Persistent |
| `HasVoted` flag | ~48 bytes | Persistent |
| `VoteRecord` | ~56 bytes | Persistent |
| `LastProposal` timestamp | ~48 bytes | Persistent |
| Token `Balance` | ~48 bytes | Persistent |
| Token `Allowance` | ~56 bytes | Temporary |

The governance contract uses **persistent storage** for proposals and votes. The TTL extension policy bumps entries by 518,400 ledgers (~30 days at 5 s/ledger) on every read and write — factor this into ongoing storage rent costs.

---

## Recommended Deployment Limits

These are safe upper bounds for production deployment:

```toml
# Soroban resource limits (Futurenet / Mainnet defaults as of 2025)
[resource_limits]
max_cpu_instructions_per_tx   = 100_000_000
max_memory_bytes_per_tx       = 40_971_520
max_ledger_read_entries       = 40
max_ledger_write_entries      = 25
max_read_bytes                = 200_000
max_write_bytes               = 66_560
max_contract_data_entry_size  = 65_536   # bytes per entry
max_contract_size             = 65_536   # WASM binary bytes
```

For CosmosVote specifically:
- Keep `limit` ≤ 20 in `get_proposals` — this is already enforced in the contract.
- Avoid more than 10–15 active proposals per governance cycle to stay within read entry limits in aggregation scenarios.
- The `cast_vote` cross-contract call uses ~2 extra ledger reads; budget accordingly if the token contract itself delegates further.

---

## Running Benchmarks Locally

```bash
cargo test bench_ --features testutils -- --nocapture
```

This prints the CPU instruction count for `create_proposal` and `cast_vote`, and asserts each stays within 10% of its baseline. See `contracts/governance/src/benchmarks.rs` for the test implementation and `docs/performance.md` for CI integration details.

To measure any other method, copy the pattern from `benchmarks.rs`:

```rust
env.as_contract(&gov.address, || { env.budget().reset_unlimited(); });
let before = env.budget().cpu_instruction_cost();
gov.some_method(...);
let consumed = env.budget().cpu_instruction_cost() - before;
println!("some_method: {} instructions", consumed);
```

---

## References

- [Soroban Resource Limits](https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering)
- [Soroban SDK — Budget API](https://docs.rs/soroban-sdk/latest/soroban_sdk/struct.Budget.html)
- [Storage & TTL Strategy](./storage.md)
- [Performance & Benchmark Baselines](./performance.md)

---

## Voter Count Cap (`MAX_VOTER_COUNT`)

A single `cast_vote` call is O(1): it reads and writes a bounded number of ledger entries regardless of the total number of voters. However, **any future bulk operation over all voters** (e.g., iterating `VoteRecord` entries in `finalise()`) would scale linearly and could exhaust the per-transaction instruction budget.

To guarantee that such extensions remain safe, `cast_vote` enforces a hard cap:

```rust
pub const MAX_VOTER_COUNT: u32 = 10_000;
```

Once `proposal.voter_count` reaches `MAX_VOTER_COUNT`, `cast_vote` returns `MaxVotersReached (61)`.

### Gas budget analysis for a bulk-vote iteration at cap

Assuming a bulk loop iterates all 10 000 voters:

| Operation per voter | Est. instructions | Total at 10 000 voters |
|--------------------|------------------|------------------------|
| Persistent read (`VoteRecord`) | ~200 000 | ~2 000 000 000 |

This exceeds the 100 000 000 instruction limit, which is why bulk iteration is **not** done in the current `finalise()`. The cap ensures that if such an operation is added in the future, it can be split into bounded batches (e.g., 500 voters per call = ~100 M instructions).

### Raising the cap

If a higher cap is required, the constant can be updated and a fresh gas benchmark run with `cargo test bench_ -- --nocapture`. Any bulk operations must be reviewed for instruction budget compliance before the cap is raised.
