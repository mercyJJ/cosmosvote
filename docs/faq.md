# FAQ

## General

**Q: What blockchain does CosmosVote run on?**
A: Stellar, using the Soroban smart contract platform (Protocol 22+).

**Q: What token standard does CosmosVote use?**
A: The token contract is SEP-41 compatible.

**Q: Can I use an existing token instead of deploying the CosmosVote token?**
A: Yes. The governance contract accepts any SEP-41-compatible token address at initialization.

## Proposals

**Q: Who can create a proposal?**
A: Any address with a token balance >= `min_proposal_balance` (0 = anyone).

**Q: Can a proposal be modified after creation?**
A: No. Title, description, duration, and start/end times are immutable. Only the quorum can be updated by the admin while the proposal is Active.

**Q: What happens if nobody votes?**
A: The proposal will be Rejected at finalization (total_votes = 0 < quorum).

**Q: Can the voting period be extended?**
A: No. Duration is fixed at creation.

## Voting

**Q: How is vote weight calculated?**
A: Vote weight equals the voter's token balance at the time they cast their vote.

**Q: Can I change my vote?**
A: No. Each address can vote exactly once per proposal.

**Q: Do abstain votes count?**
A: Abstain votes count toward quorum but not toward the yes/no outcome.

**Q: What happens on a tie?**
A: A tie (yes == no) results in rejection, even if quorum is met.

## Admin

**Q: What can the admin do?**
A: Execute passed proposals, cancel active proposals, update quorum on active proposals, pause/unpause the contract, and transfer admin privileges.

**Q: Can the admin vote?**
A: By default yes. Set `restrict_admin_vote = true` at initialization to prevent the admin from voting on proposals they created.

**Q: Can the admin alter votes?**
A: No. Vote records are stored in persistent storage and cannot be modified after casting.

## Security

**Q: Is CosmosVote audited?**
A: See [AUDIT.md](../AUDIT.md) for current audit status.

**Q: What happens if the token contract is compromised?**
A: A compromised token contract could return inflated balances. The admin must deploy a trustworthy token. This is a documented accepted risk.

---

## Wallet Connection

**Q: My wallet is not connecting. What should I check first?**
A: Work through this checklist in order:
1. Make sure your wallet extension (e.g., Freighter) is installed and unlocked.
2. Check that your wallet is set to the correct Stellar network — **Testnet** or **Mainnet** — to match the CosmosVote deployment you are using.
3. Refresh the page and try clicking "Connect Wallet" again.
4. If the site was open before you installed the wallet, close and reopen the browser tab so the extension can inject itself.
5. Disable other wallet extensions that may conflict (e.g., multiple browser wallet extensions active at once).

**Q: I get "Wallet not found" or a blank modal when I click Connect Wallet.**
A: This usually means the wallet extension is not detected. Confirm the extension is installed, enabled, and not blocked by a browser policy. If you are using a Chromium-based browser in incognito mode, you must explicitly allow the extension to run in incognito. After enabling it, reload the page.

**Q: The wallet popup opens but hangs on "Awaiting authorization".**
A: The extension is waiting for you to approve or reject the connection request. Check for a pending notification badge on the wallet icon in your browser toolbar and click it to approve. If the popup disappeared, open the extension manually and look for a pending connection request.

**Q: My wallet connected once but now shows "Not connected" every time I reload.**
A: CosmosVote stores the connection state in the browser session. If you cleared cookies or local storage, or if the extension timed out, you must reconnect. Click "Connect Wallet" again and approve in the extension. Enabling "Auto-approve trusted sites" in your wallet settings prevents this on future visits.

**Q: I connected my wallet but I see a different address than expected.**
A: You may have multiple accounts in your wallet. Open the wallet extension, switch to the correct account, and then reconnect on the CosmosVote site. The site always reads the currently active account from the extension.

---

## RPC and Network Errors

**Q: I see "RPC timeout" or "Network request failed". What does this mean?**
A: The frontend could not reach the Soroban RPC endpoint. Common causes:
- The configured RPC URL is temporarily unavailable (check its status page or try a different public endpoint).
- You are behind a restrictive firewall or VPN that blocks the RPC port.
- The Stellar testnet is undergoing scheduled maintenance.

Try refreshing the page. If the problem persists, check the network in your browser DevTools (F12 → Network tab) for the exact failing URL and HTTP status code.

**Q: Proposals are not loading — the page shows a spinner indefinitely.**
A: This is almost always an RPC connectivity issue. Open the browser console (F12 → Console) and look for a failed fetch or CORS error. If you see a `503 Service Unavailable`, the RPC node is overloaded; try again in a few minutes or switch to an alternative endpoint by updating `VITE_STELLAR_RPC_URL` in your `.env`.

**Q: My transaction was submitted but I never see a confirmation.**
A: The transaction may still be in flight. Wait 30–60 seconds and refresh. If it still does not appear, check the transaction hash in the [Stellar Expert explorer](https://stellar.expert/explorer/testnet) (testnet) or [Stellar.expert mainnet](https://stellar.expert/explorer/public). A common reason for silent failure is an insufficient fee; the transaction may have been dropped from the transaction queue if the network is congested. Resubmit with a higher fee.

---

## Transaction Errors

**Q: My transaction was rejected with "Transaction rejected by user".**
A: You or your wallet explicitly rejected the signing request. This is not an error — it means the transaction was cancelled before it was broadcast. If you intended to submit it, click the action button again and approve the signing request in your wallet popup.

**Q: I get "Insufficient balance" even though I can see tokens in my wallet.**
A: A few things can cause this:
- Your token balance is below the `min_proposal_balance` threshold required to create a proposal. Check the current threshold in the app settings or by querying the contract.
- You are looking at the wrong token. Make sure you hold the governance token for this specific DAO, not a different Stellar asset.
- Your balance was delegated to another address. While a delegation is active, your tokens count toward the delegate's weight, not yours. Undelegate first if you need to create a proposal.
- There is a display lag — refresh your balance by reconnecting your wallet.

**Q: I get "Simulation failed" when I try to vote or create a proposal.**
A: Simulation runs the transaction locally against the current ledger state before broadcasting. If it fails, the transaction would certainly fail on-chain. Common causes:
- The proposal has already been finalized or cancelled.
- The voting period has ended.
- You have already voted on this proposal.
- The contract is paused by the admin (all state-changing operations blocked).

Check the error code in the simulation response for the exact reason.

---

## Quorum and Voting Results

**Q: My proposal passed but it shows "Rejected". Why?**
A: A proposal passes only when **both** conditions are met simultaneously:
1. `total_votes >= quorum` (minimum participation threshold met)
2. `votes_yes > votes_no` (strict majority of Yes over No)

If either condition fails at finalization time, the proposal is rejected. A tie (yes == no) also counts as rejection. Check the proposal's vote totals and quorum value to see which condition was not satisfied.

**Q: What is "quorum" and how do I know if a proposal will meet it?**
A: Quorum is the minimum total voting weight (sum of Yes + No + Abstain) required before a proposal outcome is considered valid. It is set per-proposal at creation time. If total participation is below quorum at finalization, the proposal is rejected regardless of the yes/no split.

To estimate whether quorum will be met, check the current `total_votes` on the proposal (visible in the UI) against the proposal's `quorum` field. The admin can lower the quorum on an active proposal that has received zero votes by calling `update_quorum`.

**Q: The voting deadline passed but the proposal still shows "Active". What do I do?**
A: Finalization is permissionless — anyone can call `finalise(proposal_id)` after the voting period ends. The proposal stays "Active" in the UI until someone submits that transaction. If you have Stellar CLI access, run:
```bash
stellar contract invoke --id "$GOVERNANCE_CONTRACT_ID" \
  -- finalise --proposal_id <ID>
```
Alternatively, the keeper service (if deployed) will finalize proposals automatically.

---

## Delegation

**Q: I delegated my voting power but I still cannot vote. Is that expected?**
A: Yes. Once you delegate, your address cannot cast votes directly until you call `undelegate`. Your voting power has been transferred to your delegate for the duration of the delegation. Undelegating restores your ability to vote on future proposals immediately, but not on proposals that were already open when you delegated.

**Q: Can my delegate vote on my behalf on all proposals?**
A: Your delegate can vote on any proposal using their own balance. However, the on-chain vote weight counted for your delegate equals their own token balance — the governance contract does not automatically include your delegated tokens. Off-chain tooling can compute the full delegated weight, but it has no effect on the on-chain vote record.

**Q: How do I undo a delegation?**
A: Call `token.undelegate(your_address)` from your wallet. This removes the delegation record and immediately restores your direct voting power. You can then delegate to a different address or vote directly.

**Q: Can I delegate to someone who has already delegated to someone else?**
A: Yes. The contract does not prevent this. However, multi-hop delegation is not followed — if Alice delegates to Bob and Bob has delegated to Carol, Carol does not automatically accumulate Alice's weight. Each delegation is independent and one level deep only.

---

## Help and Support

For issues not covered here, open a [GitHub discussion](https://github.com/mercyJJ/cosmosvote/discussions) or check the [CONTRIBUTING.md](../CONTRIBUTING.md) guide. For security vulnerabilities, follow the process in [SECURITY.md](../SECURITY.md).
