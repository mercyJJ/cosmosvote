//! Governance contract — on-chain event emission.

use soroban_sdk::{symbol_short, Address, BytesN, Env, String};

use crate::types::{ProposalState, Vote};

pub struct GovernanceEvents;

impl GovernanceEvents {
    pub fn initialized(env: &Env, admin: &Address, token: &Address) {
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("init")),
            (admin.clone(), token.clone()),
        );
    }

    pub fn proposal_created(
        env: &Env,
        id: u64,
        proposer: &Address,
        title: &String,
        quorum: i128,
        end_time: u64,
    ) {
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("created")),
            (id, proposer.clone(), title.clone(), quorum, end_time),
        );
    }

    pub fn vote_cast(env: &Env, proposal_id: u64, voter: &Address, vote: &Vote, weight: i128) {
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("voted")),
            (proposal_id, voter.clone(), vote.clone(), weight),
        );
    }

    /// Emitted exactly once per proposal when `finalise()` transitions it from
    /// `Active` to `Passed` or `Rejected`. Off-chain indexers should deduplicate
    /// on `(proposal_id, "final")` — the idempotency guard in `finalise()`
    /// prevents a second emission, but indexers processing historical ledgers
    /// should still treat duplicate events as no-ops.
    pub fn proposal_finalized(env: &Env, proposal_id: u64, state: &ProposalState) {
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("final")),
            (proposal_id, state.clone()),
        );
    }

    pub fn proposal_executed(env: &Env, proposal_id: u64, admin: &Address) {
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("exec")),
            (proposal_id, admin.clone()),
        );
    }

    pub fn proposal_cancelled(
        env: &Env,
        proposal_id: u64,
        admin: &Address,
        voter_count: u32,
        reason: &Option<String>,
    ) {
        let reason_str = match reason {
            Some(r) => r.clone(),
            None => String::from_str(env, ""),
        };
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("cancel")),
            (proposal_id, admin.clone(), voter_count, reason_str),
        );
    }

    pub fn upgraded(env: &Env, new_wasm_hash: &BytesN<32>) {
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("upgraded")),
            (new_wasm_hash.clone(),),
        );
    }

    pub fn quorum_updated(env: &Env, proposal_id: u64, old_quorum: i128, new_quorum: i128) {
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("quorum")),
            (proposal_id, old_quorum, new_quorum),
        );
    }

    pub fn vote_retracted(env: &Env, proposal_id: u64, voter: &Address, weight: i128) {
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("retract")),
            (proposal_id, voter.clone(), weight),
        );
    }

    pub fn vote_changed(env: &Env, proposal_id: u64, voter: &Address, old_vote: &Vote, new_vote: &Vote, weight: i128) {
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("chgvote")),
            (proposal_id, voter.clone(), old_vote.clone(), new_vote.clone(), weight),
        );
    }

    pub fn admin_transferred(env: &Env, old_admin: &Address, new_admin: &Address) {
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("admin")),
            (old_admin.clone(), new_admin.clone()),
        );
    }

    /// Emitted when the current admin nominates a pending admin via `propose_admin`.
    /// Payload: `(current_admin, pending_admin, ledger_timestamp)`.
    /// The ledger timestamp lets off-chain monitors order and correlate the
    /// two-step transfer without relying on ledger sequence alone.
    pub fn admin_transfer_proposed(
        env: &Env,
        current_admin: &Address,
        pending_admin: &Address,
        timestamp: u64,
    ) {
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("propose")),
            (current_admin.clone(), pending_admin.clone(), timestamp),
        );
    }

    /// Emitted when the pending admin calls `accept_admin` and the transfer completes.
    /// Payload: `(previous_admin, new_admin, ledger_timestamp)`.
    pub fn admin_transfer_accepted(
        env: &Env,
        previous_admin: &Address,
        new_admin: &Address,
        timestamp: u64,
    ) {
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("accept")),
            (previous_admin.clone(), new_admin.clone(), timestamp),
        );
    }

    pub fn admin_transfer_cancelled(env: &Env, admin: &Address, cancelled_pending: &Address) {
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("adm_cncl")),
            (admin.clone(), cancelled_pending.clone()),
        );
    }

    pub fn proposal_amended(
        env: &Env,
        proposal_id: u64,
        proposer: &Address,
        old_title: &String,
        new_title: &String,
        old_description: &String,
        new_description: &String,
    ) {
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("amended")),
            (
                proposal_id,
                proposer.clone(),
                old_title.clone(),
                new_title.clone(),
                old_description.clone(),
                new_description.clone(),
            ),
        );
    }

    pub fn paused(env: &Env, admin: &Address) {
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("paused")),
            admin.clone(),
        );
    }

    pub fn unpaused(env: &Env, admin: &Address) {
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("unpause")),
            admin.clone(),
        );
    }

    pub fn voting_token_updated(env: &Env, old_token: &Address, new_token: &Address) {
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("token")),
            (old_token.clone(), new_token.clone()),
        );
    }

    pub fn contract_upgraded(env: &Env, new_wasm_hash: &BytesN<32>) {
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("upgrade")),
            new_wasm_hash.clone(),
        );
    }

    /// Emitted in `cast_vote` when the admin attempts to vote on a proposal
    /// but is blocked by the `restrict_admin_vote` policy.
    ///
    /// Fields: `(proposal_id, admin, proposer)`
    pub fn admin_vote_restricted(
        env: &Env,
        proposal_id: u64,
        admin: &Address,
        proposer: &Address,
    ) {
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("adm_blk")),
            (proposal_id, admin.clone(), proposer.clone()),
        );
    }

    /// Emitted in `cast_vote` when a voter's weight exceeds the configured
    /// `concentration_threshold_bps` fraction of total supply.
    ///
    /// Fields: `(proposal_id, voter, voter_weight, total_supply, threshold_bps)`
    pub fn concentration_alert(
        env: &Env,
        proposal_id: u64,
        voter: &Address,
        voter_weight: i128,
        total_supply: i128,
        threshold_bps: u32,
    ) {
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("conc_alt")),
            (proposal_id, voter.clone(), voter_weight, total_supply, threshold_bps),
        );
    }

    pub fn min_balance_updated(env: &Env, admin: &Address, old_value: i128, new_value: i128) {
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("min_bal")),
            (admin.clone(), old_value, new_value),
        );
    }

    pub fn cooldown_updated(env: &Env, admin: &Address, old_value: u64, new_value: u64) {
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("cooldown")),
            (admin.clone(), old_value, new_value),
        );
    }

    pub fn restrict_admin_vote_updated(env: &Env, admin: &Address, old_value: bool, new_value: bool) {
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("rest_vote")),
            (admin.clone(), old_value, new_value),
        );
    }
}
