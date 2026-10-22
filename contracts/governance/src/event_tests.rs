//! Governance contract — event mapping tests.
//! Verifies each contract function emits the correct event topic and data.

#![cfg(test)]

use soroban_sdk::{symbol_short, testutils::{Address as _, Events as _}, vec, Address, Env, IntoVal};

use crate::{
    test_helpers::{advance_past_end, create_proposal, setup},
    types::{ProposalState, Vote},
};

// ---------------------------------------------------------------------------
// initialized
// ---------------------------------------------------------------------------

#[test]
fn test_initialized_event() {
    let env = Env::default();
    let t = setup(&env);
    let gov_id = t.governance.address.clone();

    // The initialized event is emitted during setup's initialize call.
    // It appears first in the event list (before token events).
    let all = env.events().all();
    // Find the event from the governance contract with "gov"+"init" topics.
    let ev = all
        .iter()
        .find(|(cid, topics, _)| {
            *cid == gov_id
                && *topics
                    == vec![
                        &env,
                        symbol_short!("gov").into_val(&env),
                        symbol_short!("init").into_val(&env),
                    ]
        })
        .expect("initialized event not emitted");

    assert_eq!(ev.2, (t.admin.clone(), t.token.address.clone()).into_val(&env));
}

// ---------------------------------------------------------------------------
// proposal_created
// ---------------------------------------------------------------------------

#[test]
fn test_proposal_created_event() {
    let env = Env::default();
    let t = setup(&env);
    let gov_id = t.governance.address.clone();
    let voter_a = t.voter_a.clone();
    let id = create_proposal(&t, &voter_a);
    let proposal = t.governance.get_proposal(&id);

    let all = env.events().all();
    let ev = all
        .iter()
        .rev()
        .find(|(cid, topics, _)| {
            *cid == gov_id
                && *topics
                    == vec![
                        &env,
                        symbol_short!("gov").into_val(&env),
                        symbol_short!("created").into_val(&env),
                    ]
        })
        .expect("proposal_created event not emitted");

    let expected = (
        id,
        voter_a.clone(),
        proposal.title.clone(),
        proposal.quorum,
        proposal.end_time,
    )
        .into_val(&env);
    assert_eq!(ev.2, expected);
}

// ---------------------------------------------------------------------------
// vote_cast
// ---------------------------------------------------------------------------

#[test]
fn test_vote_cast_event() {
    let env = Env::default();
    let t = setup(&env);
    let gov_id = t.governance.address.clone();
    let voter_a = t.voter_a.clone();
    let id = create_proposal(&t, &voter_a);
    t.governance.cast_vote(&voter_a, &id, &Vote::Yes);
    let record = t.governance.get_vote(&id, &voter_a);

    let all = env.events().all();
    let ev = all
        .iter()
        .rev()
        .find(|(cid, topics, _)| {
            *cid == gov_id
                && *topics
                    == vec![
                        &env,
                        symbol_short!("gov").into_val(&env),
                        symbol_short!("voted").into_val(&env),
                    ]
        })
        .expect("vote_cast event not emitted");

    assert_eq!(
        ev.2,
        (id, voter_a.clone(), Vote::Yes, record.weight).into_val(&env)
    );
}

// ---------------------------------------------------------------------------
// proposal_finalized — passed
// ---------------------------------------------------------------------------

#[test]
fn test_proposal_finalized_passed_event() {
    let env = Env::default();
    let t = setup(&env);
    let gov_id = t.governance.address.clone();
    let voter_a = t.voter_a.clone();
    let id = create_proposal(&t, &voter_a);
    t.governance.cast_vote(&voter_a, &id, &Vote::Yes);
    advance_past_end(&env, t.governance.get_proposal(&id).end_time);
    t.governance.finalise(&id);

    let all = env.events().all();
    let ev = all
        .iter()
        .rev()
        .find(|(cid, topics, _)| {
            *cid == gov_id
                && *topics
                    == vec![
                        &env,
                        symbol_short!("gov").into_val(&env),
                        symbol_short!("final").into_val(&env),
                    ]
        })
        .expect("proposal_finalized event not emitted");

    assert_eq!(ev.2, (id, ProposalState::Passed).into_val(&env));
}

// ---------------------------------------------------------------------------
// proposal_finalized — rejected (no votes / zero-payload edge case)
// ---------------------------------------------------------------------------

#[test]
fn test_proposal_finalized_rejected_no_votes_event() {
    let env = Env::default();
    let t = setup(&env);
    let gov_id = t.governance.address.clone();
    let voter_a = t.voter_a.clone();
    let id = create_proposal(&t, &voter_a);
    // No votes — quorum not met, should be Rejected
    advance_past_end(&env, t.governance.get_proposal(&id).end_time);
    t.governance.finalise(&id);

    let all = env.events().all();
    let ev = all
        .iter()
        .rev()
        .find(|(cid, topics, _)| {
            *cid == gov_id
                && *topics
                    == vec![
                        &env,
                        symbol_short!("gov").into_val(&env),
                        symbol_short!("final").into_val(&env),
                    ]
        })
        .expect("proposal_finalized event not emitted");

    assert_eq!(ev.2, (id, ProposalState::Rejected).into_val(&env));
}

// ---------------------------------------------------------------------------
// proposal_executed
// ---------------------------------------------------------------------------

#[test]
fn test_proposal_executed_event() {
    let env = Env::default();
    let t = setup(&env);
    let gov_id = t.governance.address.clone();
    let voter_a = t.voter_a.clone();
    let admin = t.admin.clone();
    let id = create_proposal(&t, &voter_a);
    t.governance.cast_vote(&voter_a, &id, &Vote::Yes);
    advance_past_end(&env, t.governance.get_proposal(&id).end_time);
    t.governance.finalise(&id);
    t.governance.execute(&admin, &id);

    let all = env.events().all();
    let ev = all
        .iter()
        .rev()
        .find(|(cid, topics, _)| {
            *cid == gov_id
                && *topics
                    == vec![
                        &env,
                        symbol_short!("gov").into_val(&env),
                        symbol_short!("exec").into_val(&env),
                    ]
        })
        .expect("proposal_executed event not emitted");

    assert_eq!(ev.2, (id, admin.clone()).into_val(&env));
}

// ---------------------------------------------------------------------------
// proposal_cancelled
// ---------------------------------------------------------------------------

#[test]
fn test_proposal_cancelled_event_no_reason() {
    let env = Env::default();
    let t = setup(&env);
    let gov_id = t.governance.address.clone();
    let voter_a = t.voter_a.clone();
    let admin = t.admin.clone();
    let id = create_proposal(&t, &voter_a);
    t.governance.cancel(&admin, &id, &None);

    let all = env.events().all();
    let ev = all
        .iter()
        .rev()
        .find(|(cid, topics, _)| {
            *cid == gov_id
                && *topics
                    == vec![
                        &env,
                        symbol_short!("gov").into_val(&env),
                        symbol_short!("cancel").into_val(&env),
                    ]
        })
        .expect("proposal_cancelled event not emitted");

    // reason field should be empty string when None is passed
    let expected_reason = soroban_sdk::String::from_str(&env, "");
    assert_eq!(ev.2, (id, admin.clone(), 0u32, expected_reason).into_val(&env));
}

#[test]
fn test_proposal_cancelled_event_with_reason() {
    let env = Env::default();
    let t = setup(&env);
    let gov_id = t.governance.address.clone();
    let voter_a = t.voter_a.clone();
    let admin = t.admin.clone();
    let id = create_proposal(&t, &voter_a);
    let reason = soroban_sdk::String::from_str(&env, "Duplicate proposal");
    t.governance.cancel(&admin, &id, &Some(reason.clone()));

    let all = env.events().all();
    let ev = all
        .iter()
        .rev()
        .find(|(cid, topics, _)| {
            *cid == gov_id
                && *topics
                    == vec![
                        &env,
                        symbol_short!("gov").into_val(&env),
                        symbol_short!("cancel").into_val(&env),
                    ]
        })
        .expect("proposal_cancelled event not emitted");

    // reason field should be present in event payload
    assert_eq!(ev.2, (id, admin.clone(), 0u32, reason.clone()).into_val(&env));

    // verify the reason is also stored on the proposal
    let proposal = t.governance.get_proposal(&id);
    assert_eq!(proposal.cancellation_reason, Some(reason));
}

// ---------------------------------------------------------------------------
// admin_transfer_proposed / admin_transfer_accepted  (issue #64)
// ---------------------------------------------------------------------------

#[test]
fn test_admin_transfer_proposed_event_includes_timestamp() {
    let env = Env::default();
    let t = setup(&env);
    let gov_id = t.governance.address.clone();
    let admin = t.admin.clone();
    let new_admin = Address::generate(&env);

    // Advance ledger to a known timestamp so we can assert on it.
    let known_ts: u64 = 1_700_000_000;
    env.ledger().with_mut(|l| l.timestamp = known_ts);

    t.governance.propose_admin(&admin, &new_admin);

    let all = env.events().all();
    let ev = all
        .iter()
        .rev()
        .find(|(cid, topics, _)| {
            *cid == gov_id
                && *topics
                    == vec![
                        &env,
                        symbol_short!("gov").into_val(&env),
                        symbol_short!("propose").into_val(&env),
                    ]
        })
        .expect("admin_transfer_proposed event not emitted");

    // Verify payload: (current_admin, pending_admin, timestamp)
    let expected = (admin.clone(), new_admin.clone(), known_ts).into_val(&env);
    assert_eq!(ev.2, expected);
}

#[test]
fn test_admin_transfer_accepted_event_includes_timestamp() {
    let env = Env::default();
    let t = setup(&env);
    let gov_id = t.governance.address.clone();
    let admin = t.admin.clone();
    let new_admin = Address::generate(&env);

    // Initiate transfer.
    let propose_ts: u64 = 1_700_000_000;
    env.ledger().with_mut(|l| l.timestamp = propose_ts);
    t.governance.propose_admin(&admin, &new_admin);

    // Accept at a later timestamp.
    let accept_ts: u64 = 1_700_003_600;
    env.ledger().with_mut(|l| l.timestamp = accept_ts);
    t.governance.accept_admin(&new_admin);

    let all = env.events().all();
    let ev = all
        .iter()
        .rev()
        .find(|(cid, topics, _)| {
            *cid == gov_id
                && *topics
                    == vec![
                        &env,
                        symbol_short!("gov").into_val(&env),
                        symbol_short!("accept").into_val(&env),
                    ]
        })
        .expect("admin_transfer_accepted event not emitted");

    // Verify payload: (previous_admin, new_admin, timestamp)
    let expected = (admin.clone(), new_admin.clone(), accept_ts).into_val(&env);
    assert_eq!(ev.2, expected);
}
