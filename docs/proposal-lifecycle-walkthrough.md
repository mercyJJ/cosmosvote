# Proposal Lifecycle Walkthrough

This guide walks through the full CosmosVote governance flow step by step: connecting a wallet, creating a proposal, casting votes, and finalising the outcome. A short video demo of this walkthrough is embedded in the [README](../README.md).

> **Testnet:** all steps below use the public testnet. No real funds are required.

---

## Overview

```
Connect Wallet → Create Proposal → Vote → Finalise → View Outcome
```

The full lifecycle takes approximately **5 minutes** on testnet with a short voting duration.

---

## Step 1 — Connect Your Wallet

1. Open the CosmosVote frontend in your browser.
2. Click **Connect Wallet** in the top-right corner.
3. In the modal, choose your wallet (Freighter is recommended for Stellar).
4. In the Freighter extension, approve the connection request.
5. Your wallet address appears in the header. The **token balance** is shown beneath it.

> **Don't have testnet tokens?** Use the built-in faucet: click **Get Test Tokens** on the home page. The faucet drips 100 VOTE tokens to your address. You need at least the `MIN_PROPOSAL_BALANCE` to create a proposal (default: 0.1 VOTE on testnet).

**What you should see after this step:**
- Wallet address displayed in the header
- VOTE token balance shown (non-zero after using faucet)
- Existing proposals listed on the home page

---

## Step 2 — Create a Proposal

1. Click **New Proposal** (button on the home page or navigation bar).
2. Fill in the proposal form:
   - **Title** — short description, e.g. `Increase proposal cooldown to 48 hours`
   - **Description** — detailed rationale for the change
   - **Quorum** — minimum number of votes (in base units) required for the proposal to pass; enter `1` for a quick testnet demo
   - **Duration** — voting period in seconds; enter `120` (2 minutes) for a testnet demo
3. Click **Submit Proposal**.
4. Freighter shows a transaction confirmation. Review and click **Sign**.
5. Wait for the transaction to be confirmed on-chain (usually 5–10 seconds).

**What you should see after this step:**
- A success toast notification: "Proposal created"
- Your new proposal appears at the top of the proposal list with status **Active**
- The proposal card shows: title, time remaining, current vote tally (0 Yes / 0 No / 0 Abstain)

---

## Step 3 — Cast a Vote

1. Click on your proposal card to open the **Proposal Detail** view.
2. Review the proposal title, description, quorum, and voting deadline.
3. Choose your vote: **Yes**, **No**, or **Abstain**.
4. Click the corresponding button.
5. Freighter shows a transaction confirmation. Review and click **Sign**.
6. Wait for the transaction to confirm (5–10 seconds).

**What you should see after this step:**
- Your vote is reflected immediately in the tally (e.g. `1 Yes / 0 No / 0 Abstain`)
- The **You voted** badge appears on your selection
- Attempting to vote again shows an error: "You have already voted on this proposal"

> **Voting with multiple accounts:** to test with more votes, open a second browser profile, connect a different wallet, use the faucet, and cast a different vote. This demonstrates the independent vote tracking per address.

---

## Step 4 — Finalise the Proposal

Once the voting duration has elapsed the proposal can be finalised. For the 120-second test proposal, wait 2 minutes.

1. Return to the **Proposal Detail** view (refresh if needed — the status should now show **Expired**).
2. Click **Finalise Proposal**.
3. Freighter shows a transaction confirmation. Review and click **Sign**.
4. Wait for the transaction to confirm.

**What you should see after this step:**
- Proposal status changes to **Passed** (if `Yes` votes ≥ quorum) or **Failed** (otherwise)
- The final vote tally is locked in and displayed
- A `proposal_finalised` event is emitted on-chain and appears in the Horizon event stream

> **Keeper service:** in production, the keeper service (`keeper-service/`) calls `finalise()` automatically every 10 minutes so manual finalisation is not required.

---

## Step 5 — View the Outcome

1. The proposal card on the home page now shows the final status badge: **Passed** or **Failed**.
2. Click the proposal to see:
   - Final vote counts (Yes / No / Abstain)
   - Whether quorum was reached
   - The block/ledger number of finalisation

The on-chain record is permanent and auditable. You can verify the events using the Stellar Horizon API:

```bash
stellar events \
  --network testnet \
  --contract-id $GOVERNANCE_CONTRACT_ID \
  --start-ledger <DEPLOY_LEDGER>
```

---

## Full Flow Summary

| Step | Action | Transaction? | Expected outcome |
|------|--------|-------------|-----------------|
| 1 | Connect wallet | No | Address shown in header |
| 2 | Create proposal | ✅ Yes | Proposal appears with Active status |
| 3 | Cast vote | ✅ Yes | Tally updates, "You voted" badge shown |
| 4 | Finalise | ✅ Yes | Status changes to Passed or Failed |
| 5 | View outcome | No | Final tally locked, on-chain event emitted |

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| "Insufficient balance" on proposal creation | Token balance below `MIN_PROPOSAL_BALANCE` | Use the faucet to get test tokens |
| "Proposal cooldown active" | Another proposal was submitted recently from this address | Wait for the cooldown period to expire |
| "You have already voted" | This address already cast a vote | Use a different wallet address |
| "Proposal not active" on vote | Voting period has already ended | Finalise the proposal instead |
| Transaction pending for > 30 seconds | RPC congestion | Refresh and check Horizon for the transaction status |
| Blank proposal list | RPC endpoint unreachable | Check `VITE_STELLAR_RPC_URL` in frontend config |

---

## Related Documents

- [Proposal Lifecycle (technical)](./lifecycle.md) — state machine diagram and contract-level detail
- [Frontend Contract Flow](./frontend-contract-flow.md) — sequence diagram of wallet ↔ contract interaction
- [Getting Started](./GETTING_STARTED.md) — environment setup and local development
- [Governance Model](./governance-model.md) — quorum, token weighting, and circuit breaker
