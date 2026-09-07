# CosmosVote — Development Issues

> 125 actionable issues grouped by domain. Suitable for direct import into GitHub Issues or Jira.

---

## 📋 Table of Contents

1. [Smart Contracts](#-smart-contracts-issues-1-25) (25 issues)
2. [Frontend](#-frontend-issues-26-50) (25 issues)
3. [Testing](#-testing-issues-51-70) (20 issues)
4. [Security](#-security-issues-71-85) (15 issues)
5. [DevOps](#-devops-issues-86-100) (15 issues)
6. [Documentation](#-documentation-issues-101-112) (12 issues)
7. [Miscellaneous / Product](#-miscellaneous--product-issues-113-125) (13 issues)

---

## 🔗 Smart Contracts (Issues 1–25)

---

### Issue #1 — Immutable token address prevents governance token upgrades

**Description:** The `voting_token` address is set once during `initialize()` and can never be changed. If the token contract needs to be migrated or upgraded, the governance contract becomes permanently broken with no recovery path.

**Acceptance Criteria:**
- Add an admin-only `update_voting_token(admin, new_token)` function
- Emit a `VotingTokenUpdated` event on change
- Only allow update when no proposals are `Active`
- Add a test covering the happy path and the guard against active proposals

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `smart-contract`, `enhancement`, `admin`

---

### Issue #2 — No on-chain execution payload for passed proposals

**Description:** `execute()` only flips state to `Executed`; it performs no on-chain action. This is documented as KI-004 but blocks real DAO use-cases where execution should trigger cross-contract calls (e.g., treasury disbursements, parameter changes).

**Acceptance Criteria:**
- Add an optional `payload: Option<Bytes>` field to `Proposal`
- On `execute()`, if payload is present, invoke the target contract via cross-contract call
- Add `ExecutionTarget` and `ExecutionCalldata` fields or a structured `ExecutionPayload` type
- Document the payload encoding format
- Add tests for payload execution and failure handling

**Priority:** High
**Estimated Effort:** Large
**Dependencies:** None
**Labels:** `smart-contract`, `enhancement`, `feature`

---

### Issue #3 — Admin is a single EOA with no multisig support

**Description:** The admin address is a single key. KI-002 documents this as an accepted risk, but the contract provides no native support for a multisig or timelock admin, making production deployments unsafe without external tooling.

**Acceptance Criteria:**
- Document the recommended pattern for using a Stellar multisig account as admin
- Add a deploy script example using a multisig admin
- Consider adding a `pending_admin` two-step transfer pattern to prevent accidental admin loss
- Add a test for the two-step transfer flow

**Priority:** High
**Estimated Effort:** Medium
**Dependencies:** None
**Labels:** `smart-contract`, `security`, `enhancement`

---

### Issue #4 — Two-step admin transfer to prevent accidental admin loss

**Description:** `transfer_admin()` immediately overwrites the admin with no confirmation from the new admin. A typo or wrong address permanently locks out the current admin.

**Acceptance Criteria:**
- Add `propose_admin(admin, new_admin)` that stores a `PendingAdmin` in instance storage
- Add `accept_admin(new_admin)` that requires auth from `new_admin` and finalizes the transfer
- Old admin remains active until `accept_admin` is called
- Emit `AdminTransferProposed` and `AdminTransferAccepted` events
- Add tests for both happy path and expiry/cancellation

**Priority:** High
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `smart-contract`, `security`, `enhancement`

---

### Issue #5 — No storage TTL / expiry bump for persistent entries

**Description:** Soroban persistent storage entries expire after a ledger TTL. The contract never calls `env.storage().persistent().extend_ttl()` on proposal or vote records, meaning old proposals and vote records can be silently deleted from the ledger.

**Acceptance Criteria:**
- Call `extend_ttl` on `Proposal`, `HasVoted`, and `VoteRecord` entries whenever they are read or written
- Define a `PERSISTENT_BUMP_AMOUNT` constant (e.g., 30 days in ledgers)
- Add a public `bump_proposal(proposal_id)` function so anyone can extend a proposal's TTL
- Add tests verifying entries survive past the default TTL

**Priority:** Critical
**Estimated Effort:** Medium
**Dependencies:** None
**Labels:** `smart-contract`, `bug`, `storage`

---

### Issue #6 — `update_quorum` can be called on proposals with existing votes

**Description:** Admin can lower the quorum on a proposal that already has votes, potentially making a previously-failing proposal pass retroactively. This undermines voter trust.

**Acceptance Criteria:**
- Add a check: `update_quorum` is only allowed if `total_votes == 0`
- OR add a time-lock: quorum can only be updated within the first N seconds of a proposal
- Emit a `QuorumUpdated` event with both old and new values
- Add a test asserting the guard fires when votes exist

**Priority:** High
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `smart-contract`, `security`, `governance`

---

### Issue #7 — No vote-change / vote-retraction mechanism

**Description:** Once a vote is cast it is permanent. Many governance systems allow voters to change their vote before the voting period ends. The current design may discourage early voting.

**Acceptance Criteria:**
- Add `retract_vote(voter, proposal_id)` that removes the vote and subtracts weight from tallies
- Optionally add `change_vote(voter, proposal_id, new_vote)`
- Guard: only allowed while proposal is `Active` and within voting period
- Emit `VoteRetracted` / `VoteChanged` events
- Add tests for retraction and re-vote

**Priority:** Low
**Estimated Effort:** Medium
**Dependencies:** None
**Labels:** `smart-contract`, `enhancement`, `governance`

---

### Issue #8 — `proposal_count` stored in instance storage creates a bottleneck

**Description:** `ProposalCount` is a single instance-storage counter incremented on every `create_proposal`. Under high load this is a write contention point and also means the counter is lost if instance storage expires.

**Acceptance Criteria:**
- Evaluate moving `ProposalCount` to persistent storage with TTL bumping
- OR document the accepted limitation and add a note in the ADR
- Add a test that verifies the counter survives a simulated TTL expiry

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** Issue #5
**Labels:** `smart-contract`, `performance`, `storage`

---

### Issue #9 — No event emitted when `update_quorum` is called

**Description:** `GovernanceEvents::quorum_updated` is called but the event only includes the new quorum, not the old value. Off-chain indexers cannot reconstruct the full history of quorum changes.

**Acceptance Criteria:**
- Update `quorum_updated` event to include `old_quorum` and `new_quorum`
- Update the event schema documentation
- Add a test asserting both values appear in the emitted event

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `smart-contract`, `events`, `enhancement`

---

### Issue #10 — Token contract `burn` is admin-only; no self-burn for token holders

**Description:** Token holders cannot burn their own tokens. Only the admin can burn, which is overly restrictive for a governance token where holders may want to voluntarily reduce supply.

**Acceptance Criteria:**
- Add `burn_self(owner, amount)` that requires auth from `owner` only
- Keep the existing admin `burn` function
- Validate amount > 0 and balance >= amount
- Emit `Burned` event
- Add tests for self-burn and insufficient balance

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `smart-contract`, `token`, `enhancement`

---

### Issue #11 — No `decimals()` or `symbol()` on token contract (SEP-41 gap)

**Description:** The token contract is described as SEP-41 compatible but does not expose `decimals()`, `symbol()`, or `name()` functions. Wallets and explorers rely on these for display.

**Acceptance Criteria:**
- Add `name(env) -> String`, `symbol(env) -> String`, `decimals(env) -> u32` functions
- Store these values in instance storage, set during `initialize()`
- Update `initialize` signature to accept `name`, `symbol`, `decimals`
- Update all tests and deploy scripts
- Add SEP-41 compliance note to README

**Priority:** High
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `smart-contract`, `token`, `standards`, `enhancement`

---

### Issue #12 — Allowance storage uses persistent tier but has no TTL

**Description:** Token allowances are stored in persistent storage but never have their TTL extended. Allowances can silently expire, breaking integrations that rely on long-lived approvals.

**Acceptance Criteria:**
- Add an `expiry_ledger: u32` parameter to `approve()`
- Store allowance with expiry and check it in `transfer_from()`
- Bump TTL on read/write
- Add tests for expired allowances

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** Issue #5
**Labels:** `smart-contract`, `token`, `bug`, `storage`

---

### Issue #13 — No `get_proposals_by_state` or pagination for proposal listing

**Description:** The only way to list proposals is to call `get_proposal(id)` for each ID from 0 to `proposal_count - 1`. With many proposals this is expensive and there is no server-side filtering.

**Acceptance Criteria:**
- Add `get_proposals(from_id: u64, limit: u32) -> Vec<Proposal>` for paginated access
- Add `get_proposals_by_state(state: ProposalState, from_id: u64, limit: u32) -> Vec<Proposal>`
- Cap `limit` at 20 to bound compute cost
- Add tests for pagination boundaries and empty results

**Priority:** Medium
**Estimated Effort:** Medium
**Dependencies:** None
**Labels:** `smart-contract`, `enhancement`, `performance`

---

### Issue #14 — `restrict_admin_vote` only blocks admin voting on their own proposals

**Description:** The `restrict_admin_vote` flag only prevents the admin from voting on proposals they created. It does not prevent the admin from voting on proposals created by others, which may still be a governance concern.

**Acceptance Criteria:**
- Clarify the intended semantics in an ADR update
- If full admin vote restriction is desired, update the check to block admin voting on all proposals when the flag is set
- Add tests for both interpretations
- Update README to document the exact behavior

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `smart-contract`, `governance`, `documentation`

---

### Issue #15 — No contract upgrade / migration path

**Description:** There is no `upgrade(new_wasm_hash)` function. Once deployed, the contract WASM cannot be updated. This is a critical gap for a production governance system that will need bug fixes.

**Acceptance Criteria:**
- Add `upgrade(admin, new_wasm_hash: BytesN<32>)` using `env.deployer().update_current_contract_wasm()`
- Require admin auth
- Emit an `Upgraded` event with the new WASM hash
- Add a migration guide to docs
- Add a test for the upgrade path

**Priority:** High
**Estimated Effort:** Medium
**Dependencies:** None
**Labels:** `smart-contract`, `enhancement`, `devops`

---

### Issue #16 — `finalise()` can be called by anyone but has no incentive mechanism

**Description:** `finalise()` is permissionless (anyone can call it), which is correct, but there is no gas rebate or incentive for the caller. In practice, proposals may sit in `Active` state indefinitely after expiry.

**Acceptance Criteria:**
- Document the expected caller (off-chain bot / keeper) in the README and docs
- Add a `keeper` script or GitHub Action that auto-finalizes expired proposals
- Consider adding a small token reward for finalization callers (future enhancement)

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `smart-contract`, `enhancement`, `devops`

---

### Issue #17 — No minimum quorum floor relative to total supply

**Description:** A proposer can set quorum to 1 (the minimum), making a proposal pass with a single token. There is no minimum quorum as a percentage of total supply.

**Acceptance Criteria:**
- Add a `min_quorum_bps: u32` parameter to `initialize()` (basis points, e.g., 100 = 1%)
- Validate `quorum >= total_supply * min_quorum_bps / 10_000` in `create_proposal`
- Add `MinQuorumBps` to instance storage
- Add tests for the floor enforcement

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `smart-contract`, `governance`, `enhancement`

---

### Issue #18 — Proposal `description` field has no structured format

**Description:** The description is a free-form string up to 1024 chars. There is no way to attach a link to an off-chain discussion (e.g., forum post, IPFS hash) in a machine-readable way.

**Acceptance Criteria:**
- Add an optional `link: Option<String>` field to `Proposal` (max 256 chars, validated as URL prefix)
- OR document a convention for embedding IPFS CIDs in the description
- Update `create_proposal` signature and tests

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `smart-contract`, `enhancement`, `governance`

---

### Issue #19 — No event for `transfer_admin` on the token contract

**Description:** `TokenEvents::admin_transferred` is called in the token contract but the event schema is not documented and may not match the governance contract's event format, making indexing inconsistent.

**Acceptance Criteria:**
- Standardize event topic naming across both contracts (`admin_transferred` → same schema)
- Document all token contract events in `docs/events.md`
- Add a test asserting the event is emitted with correct fields

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `smart-contract`, `token`, `events`

---

### Issue #20 — `checked_add` overflow returns `ArithmeticOverflow` but no recovery

**Description:** If vote tallies overflow `i128`, the contract returns `ArithmeticOverflow` and the vote is lost. With a max supply of `i128::MAX` this is theoretically impossible but should be documented.

**Acceptance Criteria:**
- Add a comment in `cast_vote` explaining why overflow is impossible given `i128` supply bounds
- Add a property-based test asserting total votes never exceed `i128::MAX` for any valid supply
- Document the theoretical maximum supply in the README

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `smart-contract`, `documentation`, `testing`

---

### Issue #21 — No `get_config` function to inspect governance parameters

**Description:** There is no single function to read all governance configuration (min balance, cooldown, restrict_admin_vote, paused state). Clients must make multiple calls or read storage directly.

**Acceptance Criteria:**
- Add a `GovernanceConfig` struct with all instance-storage config fields
- Add `get_config(env) -> GovernanceConfig` read function
- Add a test asserting the returned config matches what was set during `initialize`

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `smart-contract`, `enhancement`, `dx`

---

### Issue #22 — Token contract has no pause mechanism

**Description:** The governance contract has pause/unpause but the token contract does not. A compromised token cannot be frozen, allowing continued transfers during an incident.

**Acceptance Criteria:**
- Add `pause(admin)` and `unpause(admin)` to the token contract
- Guard `transfer`, `transfer_from`, `mint`, `burn` with a paused check
- Emit `Paused` / `Unpaused` events
- Add tests

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `smart-contract`, `token`, `security`

---

### Issue #23 — No snapshot voting; live balance enables last-minute token accumulation

**Description:** Vote weight is the live balance at vote time (ADR-003). A whale can buy tokens, vote, then sell — or coordinate a flash-accumulation attack across multiple blocks. A snapshot at proposal creation would prevent this.

**Acceptance Criteria:**
- Evaluate adding a `snapshot_ledger` to `Proposal` set at creation time
- If snapshot voting is adopted, add a `balance_at(owner, ledger)` function to the token contract
- Document the trade-off in ADR-003 update
- Add a test demonstrating the attack vector and the mitigation

**Priority:** High
**Estimated Effort:** Large
**Dependencies:** None
**Labels:** `smart-contract`, `security`, `governance`

---

### Issue #24 — `cancel()` does not refund or notify voters

**Description:** When admin cancels a proposal, voters who already voted receive no notification and their vote records remain in persistent storage indefinitely, consuming ledger rent.

**Acceptance Criteria:**
- Emit a `ProposalCancelled` event with the list of voter addresses (or a count)
- Document that vote records for cancelled proposals are not automatically cleaned up
- Add a `cleanup_cancelled_proposal(proposal_id)` admin function to delete stale vote records and reclaim storage

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `smart-contract`, `enhancement`, `storage`

---

### Issue #25 — No integration test between governance and token contracts end-to-end

**Description:** Unit tests mock the token contract. There are no end-to-end tests that deploy both contracts and run a full proposal lifecycle (create → vote → finalize → execute) against real contract interactions.

**Acceptance Criteria:**
- Add an integration test file `contracts/integration_tests.rs`
- Cover: full pass lifecycle, full reject lifecycle, cancel lifecycle
- Run as part of `make test`
- Document how to run integration tests in the README

**Priority:** High
**Estimated Effort:** Medium
**Dependencies:** None
**Labels:** `smart-contract`, `testing`, `integration`

---

## 🖥️ Frontend (Issues 26–50)

---

### Issue #26 — Wallet connection uses `prompt()` instead of a real wallet adapter

**Description:** `App.tsx` uses `window.prompt()` to collect a Stellar address. This is not a real wallet connection — it cannot sign transactions, and it is inaccessible to screen readers and keyboard-only users.

**Acceptance Criteria:**
- Integrate `@stellar/freighter-api` or `@creit-tech/stellar-wallets-kit`
- Replace `prompt()` with a proper connect-wallet modal
- Support at minimum Freighter and xBull wallets
- Show wallet name and truncated address in the header after connection
- Add a disconnect button

**Priority:** Critical
**Estimated Effort:** Medium
**Dependencies:** None
**Labels:** `frontend`, `bug`, `ux`, `accessibility`

---

### Issue #27 — No ability to cast votes from the frontend

**Description:** The frontend is read-only. Users can browse proposals and see vote tallies but cannot cast a vote. The `cast_vote` contract function is never called from the UI.

**Acceptance Criteria:**
- Add Yes / No / Abstain vote buttons to `ProposalDetail`
- Disable buttons if wallet is not connected, proposal is not Active, or user has already voted
- Build and submit a signed transaction using the connected wallet
- Show a loading state during submission and a success/error toast on completion
- Refresh the proposal after a successful vote

**Priority:** Critical
**Estimated Effort:** Large
**Dependencies:** Issue #26
**Labels:** `frontend`, `feature`, `enhancement`

---

### Issue #28 — No ability to create proposals from the frontend

**Description:** There is no UI for creating a new governance proposal. Users must interact with the contract directly via CLI or scripts.

**Acceptance Criteria:**
- Add a "New Proposal" button visible to connected wallets with sufficient balance
- Build a form with fields: title (max 128), description (max 1024), quorum, duration
- Validate inputs client-side before submission
- Submit a signed `create_proposal` transaction
- Redirect to the new proposal on success

**Priority:** High
**Estimated Effort:** Medium
**Dependencies:** Issue #26
**Labels:** `frontend`, `feature`, `enhancement`

---

### Issue #29 — No ability to finalize, execute, or cancel proposals from the frontend

**Description:** Admin actions (`execute`, `cancel`) and the permissionless `finalise` function are not exposed in the UI. Admins must use the CLI.

**Acceptance Criteria:**
- Show a "Finalize" button on expired Active proposals (visible to all connected users)
- Show "Execute" and "Cancel" buttons on Passed/Active proposals for the admin address only
- Confirm destructive actions with a modal dialog
- Submit signed transactions and refresh state on success

**Priority:** High
**Estimated Effort:** Medium
**Dependencies:** Issue #26, Issue #27
**Labels:** `frontend`, `feature`, `enhancement`

---

### Issue #30 — All styles are inline; no CSS architecture or design system

**Description:** Every component uses inline `style={{}}` objects. This makes theming, dark mode, responsive design, and accessibility overrides extremely difficult to maintain.

**Acceptance Criteria:**
- Adopt a CSS solution (CSS Modules, Tailwind, or a component library like Radix UI)
- Extract all inline styles to the chosen system
- Define a design token set (colors, spacing, typography)
- Ensure no inline styles remain except for truly dynamic values

**Priority:** Medium
**Estimated Effort:** Large
**Dependencies:** None
**Labels:** `frontend`, `enhancement`, `dx`, `ux`

---

### Issue #31 — No dark mode support

**Description:** The UI is hardcoded to a light theme. There is no `prefers-color-scheme` media query support or manual toggle.

**Acceptance Criteria:**
- Implement dark mode using CSS custom properties or Tailwind's `dark:` variant
- Respect `prefers-color-scheme: dark` by default
- Add a manual toggle button in the header
- Persist the user's preference in `localStorage`

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** Issue #30
**Labels:** `frontend`, `enhancement`, `ux`

---

### Issue #32 — No loading skeleton / placeholder for proposal cards

**Description:** While proposals are loading, the UI shows only a plain text "Loading proposals..." message. There are no skeleton screens, which causes layout shift and a poor perceived performance experience.

**Acceptance Criteria:**
- Add skeleton card components that match the `ProposalCard` layout
- Show 3–5 skeleton cards during the initial load
- Remove skeletons and replace with real cards once data is available
- Use CSS animations for the shimmer effect

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `frontend`, `ux`, `enhancement`

---

### Issue #33 — Proposals are fetched sequentially with `Promise.all` but no concurrency limit

**Description:** `fetchAllProposals()` calls `fetchProposal(i)` for every ID in parallel via `Promise.all`. With hundreds of proposals this fires hundreds of simultaneous RPC requests, likely hitting rate limits.

**Acceptance Criteria:**
- Implement a concurrency-limited batch fetcher (e.g., fetch 10 at a time)
- Add a utility `batchFetch(ids, concurrency)` in `api.ts`
- Add error handling per individual proposal fetch (skip failed, don't abort all)
- Add a loading progress indicator showing X/N proposals loaded

**Priority:** High
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `frontend`, `performance`, `bug`

---

### Issue #34 — No error boundary; a single failed proposal fetch crashes the whole UI

**Description:** If `fetchAllProposals()` throws, the entire app shows an error string. There is no React error boundary to isolate failures.

**Acceptance Criteria:**
- Add a React `ErrorBoundary` component wrapping the main content
- Show a user-friendly error message with a retry button
- Log errors to the console (and optionally to an error tracking service)
- Individual proposal fetch failures should show a degraded card, not crash the list

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `frontend`, `bug`, `ux`

---

### Issue #35 — No pagination or virtual scrolling for large proposal lists

**Description:** All proposals are rendered at once. With hundreds of proposals the DOM becomes large and scrolling performance degrades.

**Acceptance Criteria:**
- Add client-side pagination (e.g., 20 proposals per page) with prev/next controls
- OR implement virtual scrolling using `@tanstack/react-virtual`
- Show total count and current page range
- Preserve filter/search state across page changes

**Priority:** Medium
**Estimated Effort:** Medium
**Dependencies:** Issue #33
**Labels:** `frontend`, `performance`, `enhancement`

---

### Issue #36 — `ProposalDetail` modal is not keyboard accessible

**Description:** The modal can be closed by clicking the backdrop or the × button, but there is no `Escape` key handler, no focus trap, and focus is not returned to the triggering element on close.

**Acceptance Criteria:**
- Add `onKeyDown` handler to close on `Escape`
- Implement a focus trap inside the modal (use `focus-trap-react` or native `inert`)
- Move focus to the modal's first focusable element on open
- Return focus to the triggering `ProposalCard` on close
- Add `role="dialog"` and `aria-modal="true"` attributes

**Priority:** High
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `frontend`, `accessibility`, `bug`

---

### Issue #37 — `ProposalCard` uses `onClick` on an `<article>` with no keyboard support

**Description:** The `<article>` element has an `onClick` handler but no `onKeyDown`, `tabIndex`, or `role="button"`. Keyboard users cannot activate proposal cards.

**Acceptance Criteria:**
- Add `tabIndex={0}` and `role="button"` to the article, or replace with a `<button>` wrapper
- Add `onKeyDown` to handle `Enter` and `Space`
- Ensure focus styles are visible (not suppressed by `outline: none`)

**Priority:** High
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `frontend`, `accessibility`, `bug`

---

### Issue #38 — No ARIA live region for async state updates

**Description:** When proposals load, votes are cast, or errors occur, there is no `aria-live` region to announce changes to screen reader users.

**Acceptance Criteria:**
- Add an `aria-live="polite"` region for success/info messages
- Add an `aria-live="assertive"` region for errors
- Announce loading state changes (e.g., "Proposals loaded", "Vote submitted")

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `frontend`, `accessibility`, `enhancement`

---

### Issue #39 — No responsive layout for mobile viewports

**Description:** The layout uses fixed `maxWidth: 900` and `padding: '2rem 1rem'` but the stats bar and vote grid break on small screens. There are no media queries.

**Acceptance Criteria:**
- Stats bar wraps gracefully on screens < 480px
- Vote grid in `ProposalDetail` stacks vertically on mobile
- Header layout stacks on mobile (logo above wallet info)
- Test on 375px, 768px, and 1280px viewports

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** Issue #30
**Labels:** `frontend`, `ux`, `responsive`

---

### Issue #40 — No state management library; prop drilling will become unmanageable

**Description:** `walletAddress` and `tokenBalance` are managed in `App.tsx` and passed as props. As the app grows (voting, creating proposals, admin actions), this will become deeply nested prop drilling.

**Acceptance Criteria:**
- Introduce React Context or Zustand for wallet state
- Create a `WalletContext` providing `address`, `balance`, `connect()`, `disconnect()`
- Refactor `App.tsx`, `ProposalDetail`, and future components to consume context
- Add a custom `useWallet()` hook

**Priority:** Medium
**Estimated Effort:** Medium
**Dependencies:** Issue #26
**Labels:** `frontend`, `enhancement`, `dx`

---

### Issue #41 — No transaction status tracking or toast notifications

**Description:** There is no feedback mechanism for submitted transactions. Users have no way to know if a transaction is pending, confirmed, or failed.

**Acceptance Criteria:**
- Add a toast/notification system (e.g., `react-hot-toast` or custom)
- Show "Transaction pending..." while awaiting confirmation
- Show "Transaction confirmed ✅" or "Transaction failed ❌" on resolution
- Include a link to the Stellar explorer for the transaction hash

**Priority:** High
**Estimated Effort:** Medium
**Dependencies:** Issue #27
**Labels:** `frontend`, `ux`, `enhancement`

---

### Issue #42 — No frontend tests (unit or integration)

**Description:** The `frontend/` directory has no test files, no test runner configuration, and no testing dependencies. There is zero test coverage for UI components and API functions.

**Acceptance Criteria:**
- Add Vitest and `@testing-library/react` as dev dependencies
- Add unit tests for `ProposalCard` and `ProposalDetail` components
- Add unit tests for `api.ts` functions (mock the Soroban RPC)
- Add a `test` script to `package.json`
- Integrate frontend tests into the CI workflow

**Priority:** High
**Estimated Effort:** Medium
**Dependencies:** None
**Labels:** `frontend`, `testing`, `enhancement`

---

### Issue #43 — `config.ts` hardcodes contract IDs with placeholder values

**Description:** `config.ts` likely contains placeholder contract IDs that will silently fail in production. There is no validation that the configured IDs are valid Stellar contract addresses.

**Acceptance Criteria:**
- Validate contract IDs at startup (must be non-empty, correct format)
- Show a clear error banner if config is invalid
- Document all required environment variables in `frontend/.env.example`
- Add a `validateConfig()` function called on app init

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `frontend`, `bug`, `dx`

---

### Issue #44 — No Stellar explorer links for addresses and transactions

**Description:** Proposer addresses and transaction hashes are shown as truncated strings with no links to Stellar Expert or Stellar Laboratory for verification.

**Acceptance Criteria:**
- Wrap all address displays in links to `https://stellar.expert/explorer/{network}/account/{address}`
- Wrap transaction hashes in links to the appropriate explorer
- Make explorer base URL configurable per network (local/testnet/mainnet)

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `frontend`, `ux`, `enhancement`

---

### Issue #45 — Quorum progress bar shows raw token counts, not human-readable amounts

**Description:** Vote tallies and quorum values are displayed as raw `i128` integers (e.g., `10000000`). Without knowing the token decimals, users cannot interpret these numbers.

**Acceptance Criteria:**
- Fetch token `decimals()` from the token contract on startup
- Format all token amounts using the correct decimal places (e.g., `10,000,000` → `10.00 CVT`)
- Apply formatting consistently across `ProposalCard`, `ProposalDetail`, and the stats bar

**Priority:** High
**Estimated Effort:** Small
**Dependencies:** Issue #11
**Labels:** `frontend`, `ux`, `bug`

---

### Issue #46 — No `<title>` or meta tags; poor SEO and social sharing

**Description:** `index.html` has a generic title and no Open Graph or Twitter Card meta tags. Shared links show no preview.

**Acceptance Criteria:**
- Set `<title>CosmosVote — On-chain Governance</title>`
- Add `og:title`, `og:description`, `og:image` meta tags
- Add `twitter:card` meta tags
- Consider dynamic meta tags per proposal using React Helmet or Vite SSG

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `frontend`, `seo`, `enhancement`

---

### Issue #47 — No favicon or PWA manifest

**Description:** The app has no favicon, no `manifest.json`, and no PWA configuration. The browser tab shows a blank icon.

**Acceptance Criteria:**
- Add a favicon (SVG preferred for scalability)
- Add a `manifest.json` with app name, icons, and theme color
- Add `<link rel="manifest">` to `index.html`

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `frontend`, `ux`, `enhancement`

---

### Issue #48 — No internationalization (i18n) support

**Description:** All UI strings are hardcoded in English. There is no i18n framework, making the app inaccessible to non-English speakers.

**Acceptance Criteria:**
- Integrate `react-i18next` or `@formatjs/intl`
- Extract all UI strings to an `en.json` locale file
- Add at least one additional locale as a proof of concept
- Format dates and numbers using `Intl` APIs respecting the user's locale

**Priority:** Low
**Estimated Effort:** Large
**Dependencies:** None
**Labels:** `frontend`, `i18n`, `enhancement`

---

### Issue #49 — No `robots.txt` or `sitemap.xml`

**Description:** The frontend has no `robots.txt` or `sitemap.xml`, which affects search engine indexing and crawler behavior.

**Acceptance Criteria:**
- Add `public/robots.txt` allowing all crawlers
- Add a static `sitemap.xml` or generate it at build time
- Reference the sitemap in `robots.txt`

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `frontend`, `seo`, `enhancement`

---

### Issue #50 — Frontend has no Content Security Policy headers

**Description:** The Vite dev server and production build have no CSP headers configured. This leaves the app vulnerable to XSS attacks, especially important given it handles wallet interactions.

**Acceptance Criteria:**
- Add a strict CSP header via `vite.config.ts` (dev) and the hosting platform (prod)
- Disallow `unsafe-inline` scripts
- Add `connect-src` to whitelist only the configured RPC URL
- Document the CSP policy in `docs/security/`

**Priority:** High
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `frontend`, `security`, `enhancement`

---

## 🧪 Testing (Issues 51–70)

---

### Issue #51 — No test coverage reporting threshold enforced in CI

**Description:** The CI runs `cargo-tarpaulin` and uploads to Codecov but does not fail the build if coverage drops below a threshold. Coverage can silently regress.

**Acceptance Criteria:**
- Add `--fail-under 80` (or agreed threshold) to the `cargo tarpaulin` command in CI
- Document the coverage target in `CONTRIBUTING.md`
- Add a coverage badge to the README

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `testing`, `ci`, `enhancement`

---

### Issue #52 — No tests for the `pause` / `unpause` interaction with `cast_vote`

**Description:** There is a test that pausing blocks `create_proposal`, but there are no tests verifying that `cast_vote`, `finalise`, `execute`, and `cancel` are all blocked when paused.

**Acceptance Criteria:**
- Add tests: `test_pause_blocks_cast_vote`, `test_pause_blocks_finalise`
- Verify `execute` and `cancel` are NOT blocked by pause (admin emergency actions)
- Document which functions are and are not affected by pause in the README

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `testing`, `smart-contract`, `bug`

---

### Issue #53 — No test for `transfer_admin` followed by old admin attempting privileged action

**Description:** After `transfer_admin`, the old admin should no longer be able to call `cancel`, `execute`, `pause`, etc. There is no test verifying this revocation.

**Acceptance Criteria:**
- Add `test_old_admin_loses_privileges_after_transfer`
- Verify all admin-gated functions return `NotAdmin` for the old admin
- Verify the new admin can perform all admin actions

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `testing`, `smart-contract`, `security`

---

### Issue #54 — No fuzz testing for proposal input validation

**Description:** Property-based tests exist for voting invariants but not for proposal creation input validation (title length, description length, duration bounds, quorum bounds).

**Acceptance Criteria:**
- Add proptest cases for: title at boundary lengths (0, 1, 128, 129), description at boundary lengths, duration at boundaries (59, 60, 2592000, 2592001), quorum at boundaries
- Verify correct errors are returned for all out-of-bounds inputs

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `testing`, `smart-contract`, `enhancement`

---

### Issue #55 — No test for proposal cooldown enforcement

**Description:** The `proposal_cooldown` feature is implemented but there are no tests verifying that a proposer cannot create a second proposal before the cooldown expires, or that they can after it expires.

**Acceptance Criteria:**
- Add `test_proposal_cooldown_blocks_second_proposal`
- Add `test_proposal_cooldown_allows_after_expiry` (advance ledger timestamp past cooldown)
- Add `test_proposal_cooldown_zero_allows_immediate_resubmit`

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `testing`, `smart-contract`

---

### Issue #56 — No test for `min_proposal_balance` enforcement

**Description:** The `min_proposal_balance` feature is implemented but there are no tests for it in `test.rs`.

**Acceptance Criteria:**
- Add `test_min_balance_blocks_underfunded_proposer`
- Add `test_min_balance_allows_funded_proposer`
- Add `test_min_balance_zero_allows_anyone`

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `testing`, `smart-contract`

---

### Issue #57 — No test for `restrict_admin_vote` flag

**Description:** The `restrict_admin_vote` flag is implemented but there are no tests verifying it blocks or allows admin voting under the correct conditions.

**Acceptance Criteria:**
- Add `test_restrict_admin_vote_blocks_admin_on_own_proposal`
- Add `test_restrict_admin_vote_allows_admin_on_others_proposal`
- Add `test_restrict_admin_vote_false_allows_admin_everywhere`

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `testing`, `smart-contract`

---

### Issue #58 — No test for `update_quorum` on a non-existent proposal

**Description:** `update_quorum` calls `GovernanceStorage::proposal(...).ok_or(ProposalNotFound)` but there is no test verifying this error path.

**Acceptance Criteria:**
- Add `test_update_quorum_nonexistent_proposal_fails`
- Add `test_update_quorum_zero_fails`
- Add `test_update_quorum_exceeds_supply_fails`

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `testing`, `smart-contract`

---

### Issue #59 — No test for token `transfer_from` with insufficient allowance

**Description:** The token contract's `transfer_from` checks allowance but there is no test for the `AllowanceExceeded` error path.

**Acceptance Criteria:**
- Add `test_transfer_from_insufficient_allowance_fails`
- Add `test_transfer_from_exact_allowance_succeeds`
- Add `test_transfer_from_reduces_allowance_correctly`

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `testing`, `token`

---

### Issue #60 — No test for token `burn` reducing total supply correctly

**Description:** There is no test verifying that `burn` decrements `total_supply` as well as the holder's balance.

**Acceptance Criteria:**
- Add `test_burn_reduces_total_supply`
- Add `test_burn_insufficient_balance_fails`
- Add `test_burn_non_admin_fails`

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `testing`, `token`

---

### Issue #61 — No end-to-end test for the full proposal lifecycle (Active → Passed → Executed)

**Description:** Individual lifecycle transitions are tested in isolation but there is no single test that walks through the complete happy path from proposal creation to execution.

**Acceptance Criteria:**
- Add `test_full_lifecycle_pass_and_execute` covering: initialize → create → vote yes → advance time → finalize → execute
- Add `test_full_lifecycle_reject` covering: initialize → create → vote no → advance time → finalize (rejected)
- Add `test_full_lifecycle_cancel` covering: initialize → create → cancel

**Priority:** High
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `testing`, `smart-contract`, `integration`

---

### Issue #62 — No test for multiple proposals with interleaved voting

**Description:** All tests use a single proposal. There are no tests verifying that votes on proposal 0 do not affect proposal 1, and that `has_voted` is scoped correctly per proposal.

**Acceptance Criteria:**
- Add `test_votes_isolated_across_proposals`
- Verify voter can vote on proposal 0 and proposal 1 independently
- Verify `has_voted(0, voter)` is independent of `has_voted(1, voter)`

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `testing`, `smart-contract`

---

### Issue #63 — No snapshot / regression tests for WASM binary size

**Description:** The CI checks WASM sizes with `ls -lh` but does not fail if the binary grows beyond a threshold. WASM size regressions go undetected.

**Acceptance Criteria:**
- Add a CI step that fails if any WASM binary exceeds a defined size limit (e.g., 100KB)
- Store the current sizes as a baseline in the repo
- Add a comment in the CI file explaining the size budget rationale

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `testing`, `ci`, `performance`

---

### Issue #64 — No test for `get_vote` returning `VoteNotFound` for a non-voter

**Description:** `get_vote` returns `VoteNotFound` if the voter has not voted, but this error path is not tested.

**Acceptance Criteria:**
- Add `test_get_vote_not_found_for_non_voter`
- Add `test_get_vote_returns_correct_record_after_voting`

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `testing`, `smart-contract`

---

### Issue #65 — No load / stress test for high proposal and voter counts

**Description:** There are no tests simulating governance at scale (e.g., 1000 proposals, 500 voters per proposal). Performance characteristics under load are unknown.

**Acceptance Criteria:**
- Add a benchmark test using `criterion` or Soroban's instruction counting
- Measure CPU instructions for `cast_vote` and `finalise` at 100, 500, 1000 voters
- Document the results in `docs/performance.md`
- Set a CI gate if instruction count exceeds Soroban's per-transaction limit

**Priority:** Medium
**Estimated Effort:** Large
**Dependencies:** None
**Labels:** `testing`, `performance`, `smart-contract`

---

### Issue #66 — No mutation testing to validate test suite quality

**Description:** The test suite has good coverage but there is no mutation testing to verify that tests actually catch bugs (not just execute code paths).

**Acceptance Criteria:**
- Evaluate `cargo-mutants` for Rust mutation testing
- Run mutation testing on the governance contract's core logic
- Document the mutation score and any surviving mutants
- Add surviving mutants as new test cases

**Priority:** Low
**Estimated Effort:** Medium
**Dependencies:** None
**Labels:** `testing`, `enhancement`

---

### Issue #67 — No test for `version()` returning the correct tuple after initialization

**Description:** `test_version` exists but only checks the default value. There is no test verifying that a custom version set during initialization is returned correctly.

**Acceptance Criteria:**
- Extend `test_version` to verify the version matches what was set
- Add a test for the token contract's `version()` function

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `testing`, `smart-contract`

---

### Issue #68 — No contract-level security test for reentrancy patterns

**Description:** Soroban's execution model prevents classic reentrancy, but there are no tests explicitly verifying that cross-contract calls during `cast_vote` or `finalise` cannot manipulate state.

**Acceptance Criteria:**
- Add a test deploying a malicious token contract that attempts to re-enter `cast_vote`
- Verify the re-entrant call fails or has no effect on vote tallies
- Document Soroban's reentrancy protections in `docs/security/`

**Priority:** Medium
**Estimated Effort:** Medium
**Dependencies:** None
**Labels:** `testing`, `security`, `smart-contract`

---

### Issue #69 — No test for `finalise` called twice on the same proposal

**Description:** `finalise` checks `proposal.state != Active` and returns `ProposalNotActive`, but there is no test verifying this guard fires on a second call.

**Acceptance Criteria:**
- Add `test_finalise_twice_fails`
- Add `test_execute_twice_fails`
- Add `test_cancel_already_cancelled_fails`

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `testing`, `smart-contract`

---

### Issue #70 — No test for the `prop_votes_never_exceed_supply` property with abstain votes

**Description:** The existing property test only uses Yes and No votes. The abstain path is not covered by property-based tests.

**Acceptance Criteria:**
- Extend `prop_votes_never_exceed_supply` to include a third voter casting Abstain
- Add a property test verifying `votes_abstain` counts toward quorum but not toward pass/reject outcome

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `testing`, `smart-contract`, `property-based`

---

## 🔒 Security (Issues 71–85)

---

### Issue #71 — No formal security audit has been completed

**Description:** `AUDIT.md` exists but documents no completed audits. The contracts handle governance decisions and token balances — a formal audit is required before mainnet deployment.

**Acceptance Criteria:**
- Engage a reputable Soroban/Stellar smart contract auditor
- Scope the audit to cover both `governance` and `token` contracts
- Publish the audit report in `docs/security/audit-report.md`
- Address all Critical and High findings before mainnet launch
- Update `AUDIT.md` with the audit firm, date, and report link

**Priority:** Critical
**Estimated Effort:** Large
**Dependencies:** None
**Labels:** `security`, `audit`, `critical`

---

### Issue #72 — Admin can update quorum to 1 just before finalization to force a pass

**Description:** An admin can call `update_quorum(proposal_id, 1)` seconds before `finalise()` to ensure any proposal passes regardless of actual participation. This is a governance manipulation vector.

**Acceptance Criteria:**
- Add a time-lock on `update_quorum`: it can only be called within the first 10% of the voting period
- OR remove `update_quorum` entirely and require a new proposal for quorum changes
- Document the chosen approach in an ADR
- Add a test verifying the time-lock fires

**Priority:** High
**Estimated Effort:** Small
**Dependencies:** Issue #6
**Labels:** `security`, `smart-contract`, `governance`

---

### Issue #73 — No rate limiting on `finalise()` calls

**Description:** `finalise()` is permissionless and can be called repeatedly. While idempotent after the first call (returns `ProposalNotActive`), a spam attack could waste ledger resources.

**Acceptance Criteria:**
- Verify the `ProposalNotActive` guard is sufficient to prevent state corruption
- Add a note in the contract documentation explaining the idempotency guarantee
- Consider adding a `Finalized` event deduplication check for off-chain indexers

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `security`, `smart-contract`, `documentation`

---

### Issue #74 — Secret key is stored in `.env` with no HSM or secrets manager guidance

**Description:** `STELLAR_SECRET_KEY` is stored in a `.env` file. The deploy scripts read it directly. There is no guidance on using a hardware security module (HSM) or secrets manager for production.

**Acceptance Criteria:**
- Add a `docs/security/key-management.md` guide covering: HSM usage, AWS Secrets Manager / HashiCorp Vault integration, and key rotation procedures
- Update deploy scripts to support reading the key from an environment variable injected by a secrets manager
- Add a warning in `.env.example` against committing the file

**Priority:** High
**Estimated Effort:** Medium
**Dependencies:** None
**Labels:** `security`, `devops`, `documentation`

---

### Issue #75 — No input sanitization on frontend before submitting to RPC

**Description:** The frontend passes user-provided strings (title, description, wallet address) directly to the Soroban SDK without sanitization. Malformed inputs could cause unexpected RPC errors or, in edge cases, injection-style issues.

**Acceptance Criteria:**
- Validate all user inputs client-side before building transactions
- Enforce max lengths matching contract limits (title ≤ 128, description ≤ 1024)
- Validate Stellar address format (starts with `G`, correct length) before use
- Show inline validation errors in forms

**Priority:** High
**Estimated Effort:** Small
**Dependencies:** Issue #28
**Labels:** `security`, `frontend`, `enhancement`

---

### Issue #76 — No dependency vulnerability scanning in CI

**Description:** Neither the Rust nor the frontend dependencies are scanned for known CVEs in CI. A vulnerable dependency could be introduced undetected.

**Acceptance Criteria:**
- Add `cargo audit` to the CI pipeline (fails on high/critical CVEs)
- Add `npm audit` or `pnpm audit` to the frontend CI job (fails on high/critical)
- Add Dependabot or Renovate configuration for automated dependency updates
- Document the vulnerability response process in `SECURITY.md`

**Priority:** High
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `security`, `ci`, `devops`

---

### Issue #77 — No Dependabot configuration for automated dependency updates

**Description:** There is no `.github/dependabot.yml`. Dependencies can fall behind and accumulate security vulnerabilities without automated alerts.

**Acceptance Criteria:**
- Add `.github/dependabot.yml` for both `cargo` (Rust) and `npm` (frontend) ecosystems
- Configure weekly update schedule
- Assign PRs to a maintainer for review
- Set `open-pull-requests-limit` to a reasonable value (e.g., 10)

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `security`, `devops`, `enhancement`

---

### Issue #78 — `transfer_admin` on governance contract has no zero-address guard

**Description:** `transfer_admin` does not validate that `new_admin` is a non-zero/valid address. Passing an invalid address would permanently lock admin functions.

**Acceptance Criteria:**
- Add validation that `new_admin != Address::default()` (or equivalent Soroban zero-address check)
- Return `InvalidNewAdmin` error (already defined in `ContractError`) for invalid input
- Add a test for this guard

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `security`, `smart-contract`, `bug`

---

### Issue #79 — No timelock on proposal execution after passing

**Description:** A passed proposal can be executed immediately by the admin with no delay. A timelock (e.g., 24–48 hours) would give token holders time to react to a malicious or erroneous proposal that somehow passed.

**Acceptance Criteria:**
- Add an `execution_delay: u64` parameter to `initialize()`
- Store `passed_at` timestamp on the proposal when it transitions to `Passed`
- In `execute()`, check `now >= passed_at + execution_delay`
- Add tests for the delay enforcement

**Priority:** High
**Estimated Effort:** Medium
**Dependencies:** None
**Labels:** `security`, `smart-contract`, `governance`

---

### Issue #80 — No protection against governance takeover via token minting

**Description:** The admin of the token contract can mint unlimited tokens to themselves and use them to pass any proposal. There is no cap on minting or separation between token admin and governance admin.

**Acceptance Criteria:**
- Document the risk in `docs/security/threat-model.md`
- Recommend using separate keys for token admin and governance admin
- Consider adding a `max_supply` cap to the token contract enforced in `mint()`
- Add a test verifying `mint` beyond `max_supply` fails

**Priority:** High
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `security`, `token`, `governance`

---

### Issue [#81](https://github.com/mercyJJ/cosmosvote/issues/81) — No CORS policy on the RPC endpoint used by the frontend

**Description:** The frontend connects directly to a Soroban RPC URL. If the RPC endpoint does not have proper CORS headers, the frontend will fail in browsers. If it has overly permissive CORS, it exposes the RPC to abuse.

**Acceptance Criteria:**
- Document the required CORS configuration for the RPC endpoint in `docs/`
- Add a CORS check to the frontend startup (warn if RPC is unreachable)
- For the local Docker setup, configure the quickstart node's CORS headers.

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `security`, `devops`, `frontend`

---

### Issue #82 — No audit trail for admin actions beyond on-chain events

**Description:** Admin actions (cancel, execute, pause, quorum update) emit on-chain events, but there is no off-chain audit log or alerting system. A compromised admin could act before anyone notices.

**Acceptance Criteria:**
- Add a monitoring script that watches for admin-action events and sends alerts (e.g., email, Slack, PagerDuty)
- Document the monitoring setup in `docs/security/`
- Consider adding a time-delay on admin actions (see Issue #79)

**Priority:** Medium
**Estimated Effort:** Medium
**Dependencies:** None
**Labels:** `security`, `devops`, `monitoring`

---

### Issue #83 — CodeQL workflow only covers JavaScript; Rust is not analyzed

**Description:** `.github/workflows/codeql.yml` runs CodeQL analysis but Soroban/Rust contracts are not included in the analysis scope. Security vulnerabilities in Rust code go undetected by CodeQL.

**Acceptance Criteria:**
- Extend the CodeQL workflow to include Rust analysis
- OR add `cargo-geiger` to detect unsafe Rust usage
- Add `clippy::pedantic` and `clippy::nursery` lints to catch additional issues
- Document the static analysis tools used in `SECURITY.md`

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `security`, `ci`, `enhancement`

---

### Issue #84 — No protection against proposal spam with zero `min_proposal_balance`

**Description:** When `min_proposal_balance` is 0 (the default in tests and local config), any address can create unlimited proposals, spamming the governance system and bloating storage.

**Acceptance Criteria:**
- Set a non-zero default for `min_proposal_balance` in the deploy scripts and config files
- Add documentation recommending a minimum balance in production
- Consider adding a global proposal rate limit (max N active proposals at once)

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `security`, `smart-contract`, `governance`

---

### Issue #85 — No signed release artifacts or WASM hash verification

**Description:** The release workflow uploads WASM binaries as GitHub artifacts but does not sign them or publish their SHA-256 hashes. Users deploying the contracts cannot verify they are using the official, unmodified binaries.

**Acceptance Criteria:**
- Add a step to the release workflow that computes and publishes SHA-256 hashes of WASM binaries
- Sign release artifacts using `cosign` or GPG
- Publish the hashes in the GitHub release notes
- Add a verification guide to `docs/`

**Priority:** High
**Estimated Effort:** Medium
**Dependencies:** None
**Labels:** `security`, `devops`, `release`

---

## ⚙️ DevOps (Issues 86–100)

---

### Issue #86 — No staging environment; changes go directly from dev to mainnet

**Description:** The deploy scripts support `local`, `testnet`, and `mainnet` but there is no defined staging environment or promotion workflow. Changes can be deployed to mainnet without testnet validation.

**Acceptance Criteria:**
- Define a promotion workflow: local → testnet → mainnet
- Add a CI/CD gate requiring testnet deployment and smoke tests before mainnet
- Document the promotion process in `docs/GETTING_STARTED.md`
- Add a `deploy_testnet.sh` script distinct from `deploy_mainnet.sh`

**Priority:** High
**Estimated Effort:** Medium
**Dependencies:** None
**Labels:** `devops`, `ci`, `enhancement`

---

### Issue #87 — `deploy_mainnet.sh` has no dry-run mode

**Description:** The mainnet deploy script executes immediately with no `--dry-run` flag to preview what will be deployed. A mistake cannot be caught before it hits mainnet.

**Acceptance Criteria:**
- Add a `--dry-run` flag that prints all commands without executing them
- Add a confirmation prompt before any mainnet deployment
- Add a `--yes` flag to skip the prompt for CI use
- Add a pre-flight check that verifies the WASM hash matches the expected value

**Priority:** High
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `devops`, `enhancement`, `security`

---

### Issue #88 — Docker image has no health check

**Description:** The `docker-compose.yml` defines a `stellar-node` service but has no `healthcheck` for it. The `dev` service starts immediately and may fail if the node is not yet ready.

**Acceptance Criteria:**
- Add a `healthcheck` to the `stellar-node` service (e.g., `curl http://localhost:8000/health`)
- Add `depends_on: stellar-node: condition: service_healthy` to the `dev` service
- Test that `docker compose up` reliably starts both services in the correct order

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `devops`, `docker`, `bug`

---

### Issue #89 — No multi-stage Docker build; image includes dev dependencies

**Description:** The `Dockerfile` uses a single stage, meaning the final image includes the full Rust toolchain and build tools. This produces a large image and increases the attack surface.

**Acceptance Criteria:**
- Refactor `Dockerfile` to use a multi-stage build: `builder` stage compiles WASM, `runtime` stage contains only the artifacts
- Reduce final image size by at least 50%
- Pin the base image to a specific digest for reproducibility
- Document the image build process in the README

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `devops`, `docker`, `security`, `enhancement`

---

### Issue #90 — CI does not cache Rust toolchain installation

**Description:** The CI installs the Rust toolchain on every run via `dtolnay/rust-toolchain@stable`. While `Swatinem/rust-cache@v2` caches compiled artifacts, the toolchain itself is re-downloaded each run, adding ~2 minutes.

**Acceptance Criteria:**
- Pin the Rust toolchain to a specific version (e.g., `1.78.0`) for reproducibility
- Verify `Swatinem/rust-cache` is correctly caching the toolchain
- Measure and document CI run time before and after the fix

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `devops`, `ci`, `performance`

---

### Issue #91 — No automated testnet smoke test after deployment

**Description:** After deploying to testnet, there is no automated smoke test that verifies the contracts are live and functional (e.g., call `proposal_count()`, create a test proposal).

**Acceptance Criteria:**
- Add a `scripts/smoke_test.sh` that: calls `proposal_count`, creates a test proposal, casts a vote, and verifies the state
- Integrate the smoke test into the CI/CD pipeline after testnet deployment
- Fail the pipeline if any smoke test step fails

**Priority:** High
**Estimated Effort:** Medium
**Dependencies:** Issue #86
**Labels:** `devops`, `testing`, `ci`

---

### Issue #92 — No infrastructure-as-code for cloud hosting of the frontend

**Description:** The frontend is a Vite/React app but there is no IaC (Terraform, CDK, or similar) for deploying it to a CDN or static hosting service. Deployment is manual.

**Acceptance Criteria:**
- Add Terraform or AWS CDK configuration for deploying the frontend to S3 + CloudFront (or equivalent)
- Add a CI job that builds and deploys the frontend on merge to `main`
- Document the deployment process in `docs/`
- Add environment-specific config injection at build time

**Priority:** Medium
**Estimated Effort:** Large
**Dependencies:** None
**Labels:** `devops`, `infrastructure`, `enhancement`

---

### Issue #93 — No monitoring or alerting for contract events on-chain

**Description:** There is no event indexer, monitoring dashboard, or alerting system watching for on-chain governance events. Critical events (proposal created, admin changed, contract paused) go unnoticed.

**Acceptance Criteria:**
- Set up a Stellar Horizon event stream or custom indexer for governance contract events
- Add alerting for: `AdminTransferred`, `Paused`, `ProposalCancelled` by admin
- Integrate with a notification channel (Slack, PagerDuty, or email)
- Document the monitoring setup in `docs/`

**Priority:** High
**Estimated Effort:** Large
**Dependencies:** None
**Labels:** `devops`, `monitoring`, `security`

---

### Issue #94 — Release workflow does not create a GitHub Release with changelog

**Description:** `.github/workflows/release.yml` exists but does not automatically create a GitHub Release with release notes derived from `CHANGELOG.md` or commit history.

**Acceptance Criteria:**
- Update the release workflow to create a GitHub Release on version tags
- Auto-generate release notes from `CHANGELOG.md` or using `release-drafter`
- Attach WASM binaries as release assets
- Tag the release with the contract version from `Cargo.toml`

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** Issue #85
**Labels:** `devops`, `release`, `enhancement`

---

### Issue #95 — No branch protection rules documented or enforced

**Description:** There is no documentation of required branch protection rules for `main`. Direct pushes to `main` are possible, bypassing CI checks.

**Acceptance Criteria:**
- Document required branch protection rules in `CONTRIBUTING.md`: require PR, require CI pass, require 1 review, no force push
- Add a GitHub Actions workflow check that fails if a direct push to `main` is detected
- Enable branch protection via GitHub repository settings (document the steps)

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `devops`, `ci`, `security`

---

### Issue #96 — No log aggregation or structured logging for deploy scripts

**Description:** Deploy scripts use `echo` for output with no structured logging, timestamps, or log levels. Debugging failed deployments is difficult.

**Acceptance Criteria:**
- Add a `log()` function to deploy scripts with timestamp and log level (INFO, WARN, ERROR)
- Redirect all output to a timestamped log file in addition to stdout
- Add `set -euo pipefail` to all shell scripts for fail-fast behavior
- Add error handling with meaningful messages for common failure modes

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `devops`, `enhancement`, `dx`

---

### Issue #97 — No environment variable validation in deploy scripts

**Description:** Deploy scripts use `$STELLAR_SECRET_KEY`, `$GOVERNANCE_CONTRACT_ID`, etc. without checking if they are set. A missing variable causes cryptic errors mid-deployment.

**Acceptance Criteria:**
- Add a `check_required_env()` function at the top of each deploy script
- Fail fast with a clear error message if any required variable is unset or empty
- Add a `--check-env` flag that validates all variables without deploying

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `devops`, `bug`, `dx`

---

### Issue #98 — No rollback procedure for failed deployments

**Description:** If a deployment fails mid-way (e.g., governance contract deployed but token contract fails), there is no rollback procedure. The system is left in a partially deployed state.

**Acceptance Criteria:**
- Add a `scripts/rollback.sh` that can revert to a previous contract deployment
- Document the rollback procedure in `docs/`
- Add a pre-deployment backup step that saves current contract IDs
- Add a post-deployment verification step before marking deployment as complete

**Priority:** High
**Estimated Effort:** Medium
**Dependencies:** None
**Labels:** `devops`, `enhancement`, `security`

---

### Issue #99 — No performance benchmarking in CI for contract instruction counts

**Description:** Soroban charges fees based on CPU instruction counts. There is no CI step that measures instruction counts for key operations and alerts on regressions.

**Acceptance Criteria:**
- Add a benchmark that measures instruction counts for `create_proposal`, `cast_vote`, and `finalise`
- Store baseline counts in the repo
- Fail CI if any operation exceeds the baseline by more than 10%
- Document the instruction count budget in `docs/performance.md`

**Priority:** Medium
**Estimated Effort:** Medium
**Dependencies:** None
**Labels:** `devops`, `performance`, `ci`

---

### Issue #100 — No automated license compliance check

**Description:** The project is Apache 2.0 licensed but there is no check that all dependencies are compatible licenses. An incompatible dependency could create legal issues.

**Acceptance Criteria:**
- Add `cargo-deny` with a license policy to CI (deny GPL, AGPL, etc.)
- Add `license-checker` for frontend npm dependencies
- Document the allowed license list in `CONTRIBUTING.md`
- Fail CI on any disallowed license

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `devops`, `ci`, `legal`

---

## 📚 Documentation (Issues 101–112)

---

### Issue #101 — No API reference documentation for contract functions

**Description:** The README has a brief function signature list but no full API reference with parameter descriptions, return values, error codes, and examples for every public function.

**Acceptance Criteria:**
- Add `docs/api/governance.md` with full documentation for every public governance function
- Add `docs/api/token.md` for the token contract
- Include: function signature, parameters, return type, errors thrown, and a usage example
- Link the API docs from the README

**Priority:** High
**Estimated Effort:** Medium
**Dependencies:** None
**Labels:** `documentation`, `enhancement`

---

### Issue #102 — `CHANGELOG.md` is not following Keep a Changelog format

**Description:** `CHANGELOG.md` exists but may not follow the [Keep a Changelog](https://keepachangelog.com) format consistently, making it hard to parse programmatically or generate release notes from.

**Acceptance Criteria:**
- Reformat `CHANGELOG.md` to strictly follow Keep a Changelog (Added, Changed, Deprecated, Removed, Fixed, Security sections)
- Add an `[Unreleased]` section at the top
- Document the changelog update process in `CONTRIBUTING.md`
- Add a CI check that validates the changelog format on PRs

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `documentation`, `enhancement`

---

### Issue #103 — No architecture diagram for the frontend ↔ contract interaction flow

**Description:** The README has a system architecture diagram but it only shows the contract layer. There is no diagram showing how the frontend interacts with the Soroban RPC, wallet, and contracts.

**Acceptance Criteria:**
- Add a sequence diagram to `docs/` showing: wallet connect → fetch proposals → cast vote → transaction submission → confirmation
- Use Mermaid or PlantUML for maintainability
- Embed the diagram in the README or link to it

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `documentation`, `enhancement`

---

### Issue #104 — `docs/GETTING_STARTED.md` does not cover frontend setup

**Description:** The getting started guide covers contract build and test but does not explain how to run the frontend locally, configure it, or connect it to a local Soroban node.

**Acceptance Criteria:**
- Add a "Frontend Setup" section to `docs/GETTING_STARTED.md`
- Cover: `npm install`, `cp frontend/.env.example frontend/.env`, `npm run dev`
- Explain how to configure `VITE_GOVERNANCE_CONTRACT_ID` and `VITE_TOKEN_CONTRACT_ID`
- Add a screenshot or GIF of the running frontend

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `documentation`, `enhancement`, `dx`

---

### Issue #105 — No ADR for the decision to use live balance over snapshot voting

**Description:** ADR-003 exists and documents the live-balance decision, but it does not fully analyze the attack vectors enabled by this choice (e.g., last-minute token accumulation, coordinated buying before vote).

**Acceptance Criteria:**
- Update ADR-003 with a full threat analysis of live-balance voting
- Document the conditions under which snapshot voting would be preferred
- Add a "Future Considerations" section outlining the snapshot voting migration path

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `documentation`, `governance`, `adr`

---

### Issue #106 — No contributor guide for smart contract development

**Description:** `CONTRIBUTING.md` covers the general PR process but does not explain how to add a new contract function, write tests for it, or update the event schema.

**Acceptance Criteria:**
- Add a "Smart Contract Development" section to `CONTRIBUTING.md`
- Cover: adding a function, writing unit tests, adding property tests, updating events, updating storage
- Add a "Code Review Checklist" for contract PRs

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `documentation`, `dx`, `enhancement`

---

### Issue #107 — No runbook for common operational tasks

**Description:** There is no runbook documenting how to perform common operational tasks: pausing the contract, updating quorum, transferring admin, deploying a new version.

**Acceptance Criteria:**
- Add `docs/runbook.md` with step-by-step instructions for each admin operation
- Include the exact CLI commands for each task
- Add a "Troubleshooting" section for common errors
- Link the runbook from the README

**Priority:** Medium
**Estimated Effort:** Medium
**Dependencies:** None
**Labels:** `documentation`, `devops`, `enhancement`

---

### Issue #108 — `docs/errors.md` does not map error codes to human-readable messages

**Description:** `docs/errors.md` lists error names but does not provide human-readable descriptions or guidance on how to resolve each error. Frontend developers cannot display meaningful error messages.

**Acceptance Criteria:**
- Update `docs/errors.md` to include: error code number, name, description, common cause, and resolution
- Add a mapping table that can be used by the frontend to display user-friendly messages
- Export the error map as a TypeScript constant in `frontend/src/errors.ts`

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `documentation`, `frontend`, `dx`

---

### Issue #109 — No documentation for the on-chain event schema

**Description:** Events are emitted by both contracts but there is no documentation of the event topic names, data fields, or encoding format. Off-chain indexers cannot reliably parse events.

**Acceptance Criteria:**
- Add `docs/events.md` documenting every event emitted by both contracts
- Include: event name, topics, data fields, types, and an example
- Add a TypeScript type definition file for event parsing in the frontend

**Priority:** High
**Estimated Effort:** Medium
**Dependencies:** None
**Labels:** `documentation`, `smart-contract`, `enhancement`

---

### Issue #110 — No FAQ entry for "how do I migrate to a new token contract"

**Description:** `docs/faq.md` exists but does not address the common question of what to do if the token contract needs to be replaced (e.g., after a bug fix or upgrade).

**Acceptance Criteria:**
- Add a FAQ entry: "How do I migrate to a new governance token?"
- Document the steps: deploy new token, transfer balances, deploy new governance contract
- Reference Issue #1 (immutable token address) and the planned `update_voting_token` function

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** Issue #1
**Labels:** `documentation`, `governance`

---

### Issue #111 — No documentation for the storage TTL and rent model

**Description:** `docs/storage.md` describes the storage tiers but does not explain Soroban's TTL/rent model, how entries expire, or how users should extend TTLs to keep their data alive.

**Acceptance Criteria:**
- Update `docs/storage.md` with a section on TTL and rent
- Explain the `extend_ttl` mechanism and when it is called
- Add a "Storage Cost Estimation" section
- Reference Issue #5 (missing TTL bumps)

**Priority:** Medium
**Estimated Effort:** Small
**Dependencies:** Issue #5
**Labels:** `documentation`, `smart-contract`, `storage`

---

### Issue #112 — README does not document the `restrict_admin_vote` flag behavior precisely

**Description:** The README mentions `restrict_admin_vote` but does not clearly explain the exact condition under which admin voting is blocked (only on proposals the admin created, not all proposals).

**Acceptance Criteria:**
- Update the README's "Configuration" section with a precise description of `restrict_admin_vote`
- Add an example showing when admin can and cannot vote
- Cross-reference Issue #14 (the ambiguity in the current implementation)

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** Issue #14
**Labels:** `documentation`, `governance`

---

## 🗂️ Miscellaneous / Product (Issues 113–125)

---

### Issue #113 — No delegation / vote delegation mechanism

**Description:** Token holders who are not active participants cannot delegate their voting power to a trusted representative. This reduces effective participation and quorum attainment.

**Acceptance Criteria:**
- Design a delegation model (liquid democracy or simple delegation)
- Add `delegate(owner, delegate_to)` and `undelegate(owner)` to the token contract
- Update `cast_vote` to use delegated weight when the voter has a delegator
- Add tests and documentation for the delegation flow

**Priority:** Medium
**Estimated Effort:** Large
**Dependencies:** None
**Labels:** `enhancement`, `governance`, `feature`

---

### Issue #114 — No notification system for proposal lifecycle events

**Description:** Token holders have no way to be notified when a new proposal is created, when voting is about to end, or when a proposal they voted on is finalized.

**Acceptance Criteria:**
- Build an off-chain notification service that watches Stellar Horizon for governance events
- Support email and/or webhook notifications
- Allow users to subscribe to notifications for specific proposals or all proposals
- Document the notification service setup

**Priority:** Medium
**Estimated Effort:** Large
**Dependencies:** Issue #93
**Labels:** `enhancement`, `feature`, `product`

---

### Issue #115 — No governance analytics dashboard

**Description:** There is no dashboard showing governance health metrics: voter participation rate, average quorum attainment, proposal pass rate, top voters by weight.

**Acceptance Criteria:**
- Add a `/analytics` page to the frontend with key metrics
- Show: total proposals, pass rate, average participation, top 10 voters
- Use on-chain event data as the data source
- Add time-series charts for participation trends

**Priority:** Low
**Estimated Effort:** Large
**Dependencies:** Issue #93
**Labels:** `enhancement`, `feature`, `product`, `frontend`

---

### Issue #116 — No support for proposal categories or tags

**Description:** All proposals are in a single flat list with no categorization. As the number of proposals grows, users cannot filter by topic (e.g., "Treasury", "Protocol Upgrade", "Community").

**Acceptance Criteria:**
- Add an optional `category: Option<String>` field to `Proposal` (max 32 chars, from a predefined list)
- Add category filter to the frontend proposal list
- Define the initial category list in the contract or as a governance parameter

**Priority:** Low
**Estimated Effort:** Medium
**Dependencies:** None
**Labels:** `enhancement`, `feature`, `governance`

---

### Issue #117 — No support for multi-choice proposals (beyond Yes/No/Abstain)

**Description:** The current voting model only supports Yes/No/Abstain. Some governance decisions require choosing between multiple options (e.g., "Option A / Option B / Option C").

**Acceptance Criteria:**
- Design a `MultiChoiceProposal` type with up to 10 options
- Add `create_multi_choice_proposal` and `cast_multi_choice_vote` functions
- The winning option is the one with the most votes (plurality).
- Add tests and documentation

**Priority:** Low
**Estimated Effort:** Large
**Dependencies:** None
**Labels:** `enhancement`, `feature`, `governance`

---

### Issue #118 — No on-chain treasury contract integration

**Description:** Passed proposals have no way to automatically disburse funds from a treasury. The `execute()` function is a no-op. A treasury contract would make CosmosVote a complete DAO platform.

**Acceptance Criteria:**
- Design a `Treasury` contract that holds XLM and tokens
- Add a `TreasuryAction` payload type to proposals (recipient, amount, asset)
- On `execute()`, invoke the treasury contract if a payload is present
- Add tests for treasury disbursement via governance

**Priority:** Medium
**Estimated Effort:** Large
**Dependencies:** Issue #2
**Labels:** `enhancement`, `feature`, `governance`

---

### Issue #119 — No support for proposal amendments before voting starts

**Description:** Once a proposal is created, its title, description, and quorum are immutable (except quorum via admin). Proposers cannot fix typos or clarify descriptions before voting begins.

**Acceptance Criteria:**
- Add `amend_proposal(proposer, proposal_id, new_title, new_description)` callable only by the original proposer
- Only allowed before any votes have been cast
- Emit a `ProposalAmended` event with old and new values
- Add tests

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** None
**Labels:** `enhancement`, `feature`, `governance`

---

### Issue #120 — No support for quadratic voting

**Description:** Token-weighted voting gives disproportionate power to large holders. Quadratic voting (vote weight = sqrt(tokens)) would give smaller holders more relative influence.

**Acceptance Criteria:**
- Add a `voting_model: VotingModel` enum to governance config (`TokenWeighted` | `Quadratic`)
- Implement quadratic weight calculation in `cast_vote`
- Document the trade-offs in an ADR
- Add tests for quadratic weight calculation

**Priority:** Low
**Estimated Effort:** Medium
**Dependencies:** None
**Labels:** `enhancement`, `feature`, `governance`

---

### Issue #121 — No mobile app or PWA for governance participation

**Description:** The frontend is a web app with no offline support or mobile-optimized experience. Token holders on mobile devices have a poor experience.

**Acceptance Criteria:**
- Add PWA support (service worker, manifest, offline fallback page)
- Optimize the UI for touch interactions (larger tap targets, swipe gestures)
- Test on iOS Safari and Android Chrome
- Add "Add to Home Screen" prompt

**Priority:** Low
**Estimated Effort:** Large
**Dependencies:** Issue #47
**Labels:** `enhancement`, `feature`, `frontend`, `mobile`

---

### Issue #122 — No governance forum or discussion link per proposal

**Description:** On-chain proposals have no link to off-chain discussion (forum, Discord, Snapshot). Voters cannot access context before voting.

**Acceptance Criteria:**
- Add an optional `forum_link: Option<String>` field to `Proposal`
- Display the forum link in `ProposalDetail` as a clickable button
- Validate the URL format in `create_proposal`
- Add a "Discuss" button that opens the link in a new tab

**Priority:** Low
**Estimated Effort:** Small
**Dependencies:** Issue #18
**Labels:** `enhancement`, `feature`, `governance`, `frontend`

---

### Issue #123 — No support for proposal voting by NFT or non-fungible governance rights

**Description:** The current system only supports fungible token-weighted voting. Some DAOs use NFTs or soulbound tokens for governance rights (one member, one vote).

**Acceptance Criteria:**
- Design a `VotingStrategy` interface that can be implemented by different voting power sources
- Add a `NFTVoting` strategy that gives 1 vote per NFT held
- Make the voting strategy configurable at governance initialization
- Add tests for NFT-based voting

**Priority:** Low
**Estimated Effort:** Large
**Dependencies:** None
**Labels:** `enhancement`, `feature`, `governance`

---

### Issue #124 — No governance SDK / client library for third-party integrations

**Description:** Third-party developers who want to integrate CosmosVote governance into their dApps must write their own Soroban client code. There is no official SDK.

**Acceptance Criteria:**
- Publish an npm package `@cosmosvote/sdk` wrapping the contract client functions
- Include TypeScript types for all contract inputs and outputs
- Add a README with usage examples
- Publish to npm and document the package in the main README

**Priority:** Medium
**Estimated Effort:** Large
**Dependencies:** None
**Labels:** `enhancement`, `feature`, `dx`, `sdk`

---

### Issue #125 — No governance token distribution / airdrop mechanism

**Description:** There is no tooling for distributing governance tokens to community members. The only way to distribute tokens is via manual `mint()` calls by the admin.

**Acceptance Criteria:**
- Add a `batch_mint(admin, recipients: Vec<(Address, i128)>)` function to the token contract
- Add a Merkle-drop contract or script for large-scale airdrops
- Add a CSV-based airdrop script in `scripts/`
- Document the airdrop process in `docs/`

**Priority:** Medium
**Estimated Effort:** Medium
**Dependencies:** None
**Labels:** `enhancement`, `feature`, `token`, `product`

---

*End of CosmosVote Development Issues — 125 total issues across 7 domains.*
