# Error Reference

This document maps every `ContractError` variant to its numeric code, trigger condition, common causes, and recommended client action. Use the error mapping in `frontend/src/errors.ts` to display friendly messages in your UI.

See also: [Contract API Reference](./api/) · [README](../README.md)

---

## Governance Contract Errors

### Initialization errors (1–2)

#### `AlreadyInitialized` — code 1

| Field | Detail |
|-------|--------|
| **Trigger** | `initialize()` is called when `ContractState` is already `Ready`. |
| **Common causes** | Calling `initialize()` a second time on a deployed contract; running a setup script twice against the same contract ID. |
| **Client action** | Skip initialization. Query `get_config()` to confirm the contract is already set up and use the existing deployment. |

#### `NotInitialized` — code 2

| Field | Detail |
|-------|--------|
| **Trigger** | Any contract method is called before `initialize()` has succeeded. |
| **Common causes** | Pointing the frontend or scripts at a freshly deployed but un-initialized contract address. |
| **Client action** | Call `initialize()` with the correct admin, token, and configuration parameters before invoking any other method. |

---

### Proposal errors (10–21)

#### `ProposalNotFound` — code 10

| Field | Detail |
|-------|--------|
| **Trigger** | A proposal lookup is attempted with an ID that does not exist in storage. |
| **Common causes** | Off-by-one errors when paginating; using an ID that was never created; querying a stale local cache. |
| **Client action** | Call `proposal_count()` to find the valid ID range `[0, count)` and refresh the proposal list. |

**Code example — handling `ProposalNotFound` in the frontend:**

```typescript
import { SorobanClient, xdr } from "@stellar/stellar-sdk";

async function getProposal(contractId: string, proposalId: bigint) {
  try {
    const result = await client.invokeContractFunction({
      contractId,
      method: "get_proposal",
      args: [xdr.ScVal.scvU64(xdr.Uint64.fromString(proposalId.toString()))],
    });
    return result;
  } catch (err: any) {
    // ContractError code 10 → ProposalNotFound
    if (err?.code === 10) {
      console.error("Proposal not found. Refresh the proposal list.");
      // Re-fetch proposal_count and update the local list
    }
    throw err;
  }
}
```

#### `ProposalNotActive` — code 11

| Field | Detail |
|-------|--------|
| **Trigger** | An action that requires `ProposalState::Active` (vote, amend, cancel, finalize-retry) is called after the state has already transitioned. |
| **Common causes** | Voting on an already-finalized or cancelled proposal; attempting to finalize an already-finalized proposal. |
| **Client action** | Check `proposal.state` before submitting. Display a clear status badge (`Passed`, `Rejected`, `Executed`, or `Cancelled`) and disable action buttons accordingly. |

#### `ProposalNotPassed` — code 12

| Field | Detail |
|-------|--------|
| **Trigger** | `execute()` is called on a proposal that is not in `Passed` state. |
| **Common causes** | Executing a rejected or still-active proposal; calling `execute()` before `finalise()` has been called. |
| **Client action** | Call `finalise()` first, then check `proposal.state == "Passed"` before enabling the execute button. |

#### `InvalidTitle` — code 13

| Field | Detail |
|-------|--------|
| **Trigger** | `create_proposal()` or `amend_proposal()` receives a title with length 0 or > 128 characters. |
| **Common causes** | Submitting a blank form field; pasting an overly long title from external sources. |
| **Client action** | Validate title length client-side (1–128 characters) before building the transaction. |

#### `InvalidDescription` — code 14

| Field | Detail |
|-------|--------|
| **Trigger** | `create_proposal()` or `amend_proposal()` receives a description with length 0 or > 1 024 characters. |
| **Common causes** | Submitting an empty description; exceeding the limit with rich-text content. |
| **Client action** | Enforce a 1–1 024 character limit in the form and display a live character counter. |

#### `InvalidQuorum` — code 15

| Field | Detail |
|-------|--------|
| **Trigger** | `create_proposal()` is called with `quorum <= 0`. |
| **Common causes** | Frontend sending `0` as quorum; integer truncation in serialization. |
| **Client action** | Ensure the quorum field is a positive integer. Use contract-level `get_config()` to surface the minimum quorum floor to users. |

#### `QuorumExceedsSupply` — code 16

| Field | Detail |
|-------|--------|
| **Trigger** | The requested quorum is larger than the current total token supply. |
| **Common causes** | Proposing a quorum value without first fetching the live total supply; supply decreasing after the form was loaded. |
| **Client action** | Fetch `total_supply()` from the token contract immediately before submitting and cap the quorum input at that value. |

#### `InvalidDurationRange` — code 17

| Field | Detail |
|-------|--------|
| **Trigger** | `create_proposal()` receives a `duration` below 60 seconds or above 2 592 000 seconds (30 days). |
| **Common causes** | Sending milliseconds instead of seconds; typos in configuration files; test scripts using very short durations. |
| **Client action** | Convert user-facing days/hours to seconds before building the transaction and validate the range (60 s – 30 days). |

#### `InsufficientBalance` — code 18

| Field | Detail |
|-------|--------|
| **Trigger** | The proposer's governance token balance is below `min_proposal_balance` at proposal creation time. |
| **Common causes** | User lacks enough VOTE tokens to meet the proposal threshold; transferred tokens away just before submitting. |
| **Client action** | Show the required minimum balance alongside the user's current balance. Direct users to the faucet (testnet) or a DEX if balance is insufficient. |

#### `ProposalCooldown` — code 19

| Field | Detail |
|-------|--------|
| **Trigger** | A proposer tries to create a new proposal before the `proposal_cooldown` interval has elapsed since their last submission. |
| **Common causes** | Rapid consecutive proposal creation; multi-sig coordinators submitting duplicate transactions. |
| **Client action** | Compute `last_proposal_time + cooldown` and display a countdown timer to the user. Disable the submit button until the cooldown expires. |

#### `QuorumBelowFloor` — code 20

| Field | Detail |
|-------|--------|
| **Trigger** | The requested quorum is below the governance-configured minimum quorum floor (`min_quorum_bps`). |
| **Common causes** | Setting quorum too low relative to the configured minimum percentage of total supply. |
| **Client action** | Fetch `get_config()` to retrieve `min_quorum_bps` and calculate the floor as `total_supply * min_quorum_bps / 10_000`. Display this floor to the proposer. |

#### `ProposalsStillActive` — code 21

| Field | Detail |
|-------|--------|
| **Trigger** | A new proposal is submitted when 50 or more proposals are already active simultaneously. |
| **Common causes** | Governance spam or misconfigured automated proposal bots; slow finalization on a high-activity network. |
| **Client action** | Display the current active proposal count and inform the user they must wait for active proposals to close before creating a new one. |

---

### Voting errors (22–29)

#### `VotingNotStarted` — code 22

| Field | Detail |
|-------|--------|
| **Trigger** | `cast_vote()` is called before `proposal.start_time` (i.e., before the current ledger timestamp reaches the proposal window). |
| **Common causes** | Voting immediately after proposal creation when start time is in the future; clock skew between client and chain. |
| **Client action** | Show a countdown to `proposal.start_time`. Disable the vote button until the window opens. |

#### `VotingPeriodEnded` — code 23

| Field | Detail |
|-------|--------|
| **Trigger** | `cast_vote()` or `retract_vote()` is called after `proposal.end_time`. |
| **Common causes** | Network congestion delaying transaction submission past the deadline; user idle on the page while the window closes. |
| **Client action** | Poll the current ledger timestamp and show a live countdown. Disable voting and prompt finalization once the window closes. |

**Code example — checking voting window before submitting:**

```typescript
async function canVote(proposal: Proposal): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000); // Unix seconds
  if (now < proposal.start_time) {
    console.warn(`Voting opens in ${proposal.start_time - now}s`);
    return false;
  }
  if (now > proposal.end_time) {
    console.warn("Voting period has ended");
    return false;
  }
  return true;
}
```

#### `VotingStillOpen` — code 24

| Field | Detail |
|-------|--------|
| **Trigger** | `finalise()` is called before `proposal.end_time` has passed. |
| **Common causes** | Scripts that finalize immediately after creating a proposal (useful in tests but wrong in production). |
| **Client action** | Gate the "Finalize" button behind a timestamp check. Only enable it after `proposal.end_time`. |

#### `AlreadyVoted` — code 25

| Field | Detail |
|-------|--------|
| **Trigger** | `cast_vote()` is called by an account that has already cast a vote on this proposal. |
| **Common causes** | Double-clicking the vote button; retrying a transaction that already landed. |
| **Client action** | Call `has_voted(proposal_id, voter)` before submitting. Show a "You have already voted" message and offer `change_vote()` or `retract_vote()` instead. |

#### `NoVotingPower` — code 26

| Field | Detail |
|-------|--------|
| **Trigger** | The voter held zero governance tokens at `proposal.snapshot_ledger`, or has delegated their voting power to another address. |
| **Common causes** | Voting from a wallet with no VOTE tokens; buying tokens after the proposal snapshot was taken; having delegated voting power via `set_delegation()`. |
| **Client action** | Check `balance_at(voter, snapshot_ledger)` and `get_delegation(voter)` before building the vote transaction. Inform the user of their snapshotted balance and whether they have an active delegation. |

**Code example — checking voting power before voting:**

```typescript
async function getVotingPower(
  tokenContractId: string,
  voter: string,
  snapshotLedger: number
): Promise<bigint> {
  // Returns 0 if the voter has delegated their power away
  const delegation = await tokenClient.getDelegation(voter);
  if (delegation !== null) {
    console.warn("Voting power delegated to", delegation);
    return 0n;
  }
  const balance = await tokenClient.balanceAt(voter, snapshotLedger);
  return balance;
}
```

#### `AdminVoteRestricted` — code 27

| Field | Detail |
|-------|--------|
| **Trigger** | The contract was initialized with `restrict_admin_vote = true` and the admin attempts to vote on a proposal they created. |
| **Common causes** | Admin submitting a proposal and then trying to vote on it from the same account; test scripts using the admin key for all operations. |
| **Client action** | Check `get_config().restrict_admin_vote` and `proposal.proposer` client-side. Warn admin users that they cannot vote on their own proposals. |

#### `VoteNotFound` — code 28

| Field | Detail |
|-------|--------|
| **Trigger** | `get_vote()`, `retract_vote()`, or `change_vote()` is called for an account that has not voted on the given proposal. |
| **Common causes** | Querying vote history for accounts that haven't participated; retrying a retraction that already succeeded. |
| **Client action** | Guard retract/change-vote actions behind `has_voted(proposal_id, voter) == true`. |

#### `VoteAlreadySame` — code 29

| Field | Detail |
|-------|--------|
| **Trigger** | `change_vote()` is submitted with the same vote choice as the one already recorded. |
| **Common causes** | UI state out of sync with on-chain state; user accidentally double-submitting without changing their choice. |
| **Client action** | Fetch the current vote record with `get_vote()` and disable the submit button if the selected option matches the existing record. |

---

### Admin errors (30–37)

#### `NotAdmin` — code 30

| Field | Detail |
|-------|--------|
| **Trigger** | An admin-only function (`execute`, `cancel`, `pause`, `update_quorum`, `transfer_admin`, etc.) is called by a non-admin address. |
| **Common causes** | Using the wrong keypair; submitting an admin transaction from a regular user account. |
| **Client action** | Verify the caller address matches `get_config().admin` before building admin transactions. Show clear "Admin only" messaging in the UI. |

#### `InvalidNewAdmin` — code 31

| Field | Detail |
|-------|--------|
| **Trigger** | `transfer_admin()` or `accept_admin()` receives an address that is not a valid Stellar account. |
| **Common causes** | Typo in the address; passing a contract address where a user account is expected. |
| **Client action** | Validate the new admin address with the Stellar SDK (e.g., `StrKey.isValidEd25519PublicKey()`) before submitting. |

#### `QuorumUpdateNotAllowed` — code 32

| Field | Detail |
|-------|--------|
| **Trigger** | `update_quorum()` is called outside the allowed window (only the first 10% of the voting period). |
| **Common causes** | Attempting a quorum adjustment after significant voting has already occurred. |
| **Client action** | Only surface the update-quorum UI in the early phase of the voting window. |

#### `NoPendingAdmin` — code 33

| Field | Detail |
|-------|--------|
| **Trigger** | `accept_admin()` is called but no pending admin transfer is in progress. |
| **Common causes** | Calling `accept_admin()` without a prior `transfer_admin()` call; double-accepting a transfer that already completed. |
| **Client action** | Check that a pending admin handoff is in progress before enabling the accept button. |

#### `NotPendingAdmin` — code 34

| Field | Detail |
|-------|--------|
| **Trigger** | An account other than the designated pending admin calls `accept_admin()`. |
| **Common causes** | Wrong account used to complete the two-step transfer; key rotation confusion in multi-sig setups. |
| **Client action** | Display the pending admin address from storage and instruct the correct account to complete the transfer. |

#### `NotProposer` — code 35

| Field | Detail |
|-------|--------|
| **Trigger** | `amend_proposal()` is called by an account other than the original proposer. |
| **Common causes** | Submitting an amendment from the wrong wallet; multi-sig coordinator using the wrong key. |
| **Client action** | Compare the caller's address against `proposal.proposer` before showing the amend UI. |

#### `VotesAlreadyCast` — code 36

| Field | Detail |
|-------|--------|
| **Trigger** | `amend_proposal()` is attempted on a proposal that already has at least one vote. |
| **Common causes** | Attempting to edit a proposal after community members have started voting. |
| **Client action** | Check `proposal.votes_yes + proposal.votes_no + proposal.votes_abstain == 0` before enabling amendment. |

#### `InvalidLink` — code 37

| Field | Detail |
|-------|--------|
| **Trigger** | `create_proposal()` receives a `link` field with length 0 or > 256 characters. |
| **Common causes** | Passing an empty string as the optional link (omit it instead); using overly long URLs. |
| **Client action** | Pass `None` to omit the link. If providing one, validate it is a non-empty URL ≤ 256 characters. |

---

### Contract state errors (40–41)

#### `ContractPaused` — code 40

| Field | Detail |
|-------|--------|
| **Trigger** | Any state-changing operation is attempted while the contract is paused. Also triggered automatically by the circuit breaker when a single voter's weight exceeds `concentration_threshold_bps`. |
| **Common causes** | Admin manually paused the contract for maintenance; a large token holder triggered the concentration circuit breaker. |
| **Client action** | Check `get_config().paused` on page load. Show a maintenance banner. For circuit-breaker pauses, display a message that admin review is required before voting resumes. |

#### `NotPaused` — code 41

| Field | Detail |
|-------|--------|
| **Trigger** | `unpause()` is called when the contract is already active (`paused == false`). |
| **Common causes** | Admin script calling `unpause()` more than once; idempotency issue in deployment automation. |
| **Client action** | Check `get_config().paused` before calling `unpause()`. |

---

### Arithmetic error (50)

#### `ArithmeticOverflow` — code 50

| Field | Detail |
|-------|--------|
| **Trigger** | A checked arithmetic operation (`checked_add`, `checked_mul`, etc.) overflows `i128::MAX`. |
| **Common causes** | Extremely large token supplies combined with high quorum values; malformed inputs. This is a defence-in-depth guard — under normal token supplies it should never trigger. |
| **Client action** | Treat as an unexpected internal error. Log it, display a generic "Something went wrong" message, and report the transaction hash to the protocol team. |

---

### Execution error (60)

#### `ExecutionFailed` — code 60

| Field | Detail |
|-------|--------|
| **Trigger** | The on-chain treasury disbursement via `disburse()` fails during `execute()`. |
| **Common causes** | Treasury contract not deployed or paused; insufficient treasury balance for the requested disbursement; cross-contract invocation error. |
| **Client action** | Inspect the transaction's diagnostic events for the treasury sub-call failure. Resolve the treasury issue and retry `execute()`. |

---

## Token Contract Errors

| Code | Name | Trigger | Common Cause | Client Action |
|------|------|---------|--------------|---------------|
| 1 | `AlreadyInitialized` | Token `initialize()` called again. | Setup script run twice. | Skip initialization. |
| 2 | `NotInitialized` | Token method called before `initialize()`. | Pointing at un-initialized contract. | Call `initialize()` first. |
| 10 | `NotAdmin` | Admin-only token function called by non-admin. | Wrong keypair. | Use the admin account. |
| 11 | `InvalidNewAdmin` | Invalid address passed to admin transfer. | Typo or wrong address type. | Validate with `StrKey.isValidEd25519PublicKey()`. |
| 20 | `InvalidAmount` | Zero or negative transfer amount. | UI allowing 0-value sends. | Enforce `amount > 0` client-side. |
| 21 | `InsufficientBalance` | Sender balance < transfer amount. | User has fewer tokens than requested. | Fetch balance before submitting. |
| 22 | `AllowanceExceeded` | `transfer_from()` amount exceeds approved allowance. | Allowance not increased before spending. | Call `approve()` with sufficient allowance first. |

---

## Frontend Error Mapping

The frontend maps contract error codes to user-friendly messages via `frontend/src/errors.ts`. The pattern below handles both numeric codes returned by the Soroban SDK and named variants:

```typescript
// frontend/src/errors.ts (example)
export const CONTRACT_ERRORS: Record<number, { message: string; action: string }> = {
  10: { message: "Proposal not found.",        action: "Refresh the proposal list." },
  11: { message: "Proposal is not active.",    action: "Check the proposal status." },
  18: { message: "Insufficient token balance.",action: "Acquire VOTE tokens before retrying." },
  22: { message: "Voting has not started yet.",action: "Check the voting start time." },
  23: { message: "Voting period has ended.",   action: "You can no longer vote on this proposal." },
  25: { message: "You have already voted.",    action: "Use 'Change Vote' or 'Retract Vote'." },
  26: { message: "No voting power.",           action: "Your balance at snapshot was zero, or you have delegated." },
  40: { message: "Contract is paused.",        action: "Wait for admin to unpause or contact support." },
};

export function parseContractError(err: unknown): string {
  const code = (err as any)?.code ?? (err as any)?.result?.error?.code;
  return CONTRACT_ERRORS[code]?.message ?? "An unexpected contract error occurred.";
}
```

---

## Related Docs

- [Contract API Reference](./api/)
- [README](../README.md)
- [Proposal Lifecycle](./lifecycle.md)
- [Events Reference](./events.md)
