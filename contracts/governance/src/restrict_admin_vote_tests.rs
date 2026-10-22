//! 2×2 test matrix for `restrict_admin_vote` semantics — issue #60
//!
//! ADR-007 specifies: when `restrict_admin_vote = true` the admin is blocked
//! from voting on proposals **they created** (`voter == admin && proposer == admin`).
//! Admin may vote on proposals created by others.
//!
//! Matrix:
//! | Proposer      | restrict_admin_vote | Expected result            |
//! |---------------|---------------------|----------------------------|
//! | admin         | true                | AdminVoteRestricted (error) |
//! | admin         | false               | Vote succeeds              |
//! | other (voter) | true                | Vote succeeds              |
//! | other (voter) | false               | Vote succeeds              |

#![cfg(test)]

use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Events},
    vec, Address, Env, IntoVal, String,
};

use crate::{
    types::{ContractError, Vote},
    GovernanceContract, GovernanceContractClient,
};
use cosmosvote_token::{TokenContract, TokenContractClient};

// ---------------------------------------------------------------------------
// Shared helper
// ---------------------------------------------------------------------------

struct TestEnv<'a> {
    env: &'a Env,
    gov: GovernanceContractClient<'a>,
    _token: TokenContractClient<'a>,
    admin: Address,
    voter: Address,
}

fn setup_with_flag(env: &Env, restrict_admin_vote: bool) -> TestEnv<'_> {
    env.mock_all_auths();

    let admin = Address::generate(env);
    let voter = Address::generate(env);

    let token_id = env.register(TokenContract, ());
    let token = TokenContractClient::new(env, &token_id);
    token.initialize(
        &admin,
        &1_000_000_000i128,
        &String::from_str(env, "CosmosVote"),
        &String::from_str(env, "VOTE"),
        &7u32,
    );
    token.mint(&admin, &admin, &10_000_000i128);
    token.mint(&admin, &voter, &10_000_000i128);

    let gov_id = env.register(GovernanceContract, ());
    let gov = GovernanceContractClient::new(env, &gov_id);
    gov.initialize(
        &admin,
        &token_id,
        &0i128,
        &0u64,
        &0u32,
        &restrict_admin_vote,
        &None,
        &0u32,
    );

    TestEnv { env, gov, _token: token, admin, voter }
}

fn create_proposal_by(t: &TestEnv, proposer: &Address) -> u64 {
    t.gov.create_proposal(
        proposer,
        &String::from_str(t.env, "Test Proposal"),
        &String::from_str(t.env, "Description"),
        &5_000_000i128,
        &604_800u64,
        &None,
        &None,
    )
}

// ---------------------------------------------------------------------------
// 2×2 matrix tests
// ---------------------------------------------------------------------------

/// Cell (admin proposer, flag=true): admin CANNOT vote on own proposal.
#[test]
fn test_admin_proposer_flag_true_blocks_admin_vote() {
    let env = Env::default();
    let t = setup_with_flag(&env, true);

    let proposal_id = create_proposal_by(&t, &t.admin.clone());

    let result = t.gov.try_cast_vote(&t.admin, &proposal_id, &Vote::Yes);
    assert_eq!(
        result,
        Err(Ok(ContractError::AdminVoteRestricted)),
        "admin should be blocked from voting on own proposal when restrict_admin_vote=true"
    );
}

/// Cell (admin proposer, flag=false): admin CAN vote on own proposal.
#[test]
fn test_admin_proposer_flag_false_allows_admin_vote() {
    let env = Env::default();
    let t = setup_with_flag(&env, false);

    let proposal_id = create_proposal_by(&t, &t.admin.clone());

    t.gov.cast_vote(&t.admin, &proposal_id, &Vote::Yes);
    assert!(
        t.gov.has_voted(&proposal_id, &t.admin),
        "admin should be able to vote on own proposal when restrict_admin_vote=false"
    );
}

/// Cell (other proposer, flag=true): admin CAN vote on proposals by others.
#[test]
fn test_other_proposer_flag_true_allows_admin_vote() {
    let env = Env::default();
    let t = setup_with_flag(&env, true);

    let proposal_id = create_proposal_by(&t, &t.voter.clone());

    // Admin votes on a proposal created by `voter` — should be allowed.
    t.gov.cast_vote(&t.admin, &proposal_id, &Vote::Yes);
    assert!(
        t.gov.has_voted(&proposal_id, &t.admin),
        "admin should be allowed to vote on proposals created by others even with restrict_admin_vote=true"
    );
}

/// Cell (other proposer, flag=false): admin CAN vote on proposals by others.
#[test]
fn test_other_proposer_flag_false_allows_admin_vote() {
    let env = Env::default();
    let t = setup_with_flag(&env, false);

    let proposal_id = create_proposal_by(&t, &t.voter.clone());

    t.gov.cast_vote(&t.admin, &proposal_id, &Vote::No);
    assert!(
        t.gov.has_voted(&proposal_id, &t.admin),
        "admin should be able to vote on others' proposals when restrict_admin_vote=false"
    );
}

// ---------------------------------------------------------------------------
// Snapshot test: admin_vote_restricted event
// ---------------------------------------------------------------------------

/// Verifies the `adm_blk` event is emitted (and has correct payload) when
/// admin is blocked from voting on their own proposal.
#[test]
fn test_admin_vote_restricted_event_emitted() {
    let env = Env::default();
    let t = setup_with_flag(&env, true);

    let proposal_id = create_proposal_by(&t, &t.admin.clone());
    let gov_id = t.gov.address.clone();

    // This call should fail — but it should also emit the event before returning.
    let _ = t.gov.try_cast_vote(&t.admin, &proposal_id, &Vote::Yes);

    let all = env.events().all();
    let ev = all
        .iter()
        .find(|(cid, topics, _)| {
            *cid == gov_id
                && *topics
                    == vec![
                        t.env,
                        symbol_short!("gov").into_val(t.env),
                        symbol_short!("adm_blk").into_val(t.env),
                    ]
        })
        .expect("admin_vote_restricted event (adm_blk) should be emitted");

    // Payload: (proposal_id, admin, proposer) — proposer is admin in this case.
    let expected_data =
        (proposal_id, t.admin.clone(), t.admin.clone()).into_val(t.env);
    assert_eq!(
        ev.2, expected_data,
        "adm_blk event payload should be (proposal_id, admin, proposer)"
    );
}
