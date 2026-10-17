//! Voter count cap tests — issue #59
//!
//! Verifies that `MAX_VOTER_COUNT` is enforced in `cast_vote` and that
//! `MaxVotersReached` is returned when the limit is hit.

#![cfg(test)]

use soroban_sdk::{
    testutils::Address as _,
    Address, Env, String,
};

use crate::{
    types::{ContractError, Vote},
    GovernanceContract, GovernanceContractClient,
};
use cosmosvote_token::{TokenContract, TokenContractClient};

// ---------------------------------------------------------------------------
// Helper: set up a governance environment, return (gov, token, admin) and a
// closure that generates a funded voter address.
// ---------------------------------------------------------------------------

fn setup_with_voters(env: &Env, n: u32) -> (GovernanceContractClient<'_>, Address, soroban_sdk::Vec<Address>) {
    env.mock_all_auths();
    let admin = Address::generate(env);

    let token_id = env.register(TokenContract, ());
    let token = TokenContractClient::new(env, &token_id);
    token.initialize(
        &admin,
        &i128::MAX, // huge supply so we can mint freely
        &String::from_str(env, "CosmosVote"),
        &String::from_str(env, "VOTE"),
        &7u32,
    );

    let mut voters = soroban_sdk::Vec::new(env);
    for _ in 0..n {
        let voter = Address::generate(env);
        token.mint(&admin, &voter, &10_000_000i128);
        voters.push_back(voter);
    }

    let gov_id = env.register(GovernanceContract, ());
    let gov = GovernanceContractClient::new(env, &gov_id);
    gov.initialize(&admin, &token_id, &0i128, &0u64, &0u32, &false, &None, &0u32);

    (gov, admin, voters)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/// Verify the constant value matches the documented limit.
#[test]
fn test_max_voter_count_constant_value() {
    assert_eq!(
        GovernanceContract::MAX_VOTER_COUNT,
        10_000,
        "MAX_VOTER_COUNT should be 10_000"
    );
}

/// Verify that casting exactly MAX_VOTER_COUNT votes succeeds and that the
/// (MAX_VOTER_COUNT + 1)-th unique voter gets MaxVotersReached.
///
/// Note: to keep test runtime reasonable we set MAX_VOTER_COUNT to a much
/// smaller number by setting up only a small number of voters and patching
/// the proposal's voter_count directly via a tiny proposal + fake voters.
/// Instead, we test with a small ceiling by checking the boundary at 3:
/// create 3 voters, vote with all three (success), then attempt a 4th
/// — but override proposal.voter_count to MAX_VOTER_COUNT - 1 first via
/// a read-modify path.  Because Soroban tests can't directly write storage,
/// we instead use a real small scenario that exercises the error path.
///
/// For a full integration test at the actual 10 000 limit, use the benchmark
/// runner: `cargo test bench_ -- --nocapture`.
#[test]
fn test_max_voters_reached_error() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);

    let token_id = env.register(TokenContract, ());
    let token = TokenContractClient::new(&env, &token_id);
    token.initialize(
        &admin,
        &i128::MAX,
        &String::from_str(&env, "CosmosVote"),
        &String::from_str(&env, "VOTE"),
        &7u32,
    );

    // Create MAX_VOTER_COUNT + 1 voters
    let cap = GovernanceContract::MAX_VOTER_COUNT as usize;
    let mut voters = Vec::new();
    for _ in 0..(cap + 1) {
        let v = Address::generate(&env);
        token.mint(&admin, &v, &10_000_000i128);
        voters.push(v);
    }

    let gov_id = env.register(GovernanceContract, ());
    let gov = GovernanceContractClient::new(&env, &gov_id);
    gov.initialize(&admin, &token_id, &0i128, &0u64, &0u32, &false, &None, &0u32);

    let proposal_id = gov.create_proposal(
        &voters[0],
        &String::from_str(&env, "Cap Test"),
        &String::from_str(&env, "Test the voter count cap enforcement"),
        // quorum must be achievable: each voter has 10_000_000 weight; cap + 1 voters
        &(10_000_000i128 * (cap as i128 / 2)),
        &604_800u64,
        &None,
        &None,
    );

    // Cast the first `cap` votes — all should succeed.
    for voter in voters.iter().take(cap) {
        gov.cast_vote(voter, &proposal_id, &Vote::Yes);
    }

    // Check voter_count reached the cap.
    let proposal = gov.get_proposal(&proposal_id);
    assert_eq!(
        proposal.voter_count,
        GovernanceContract::MAX_VOTER_COUNT,
        "voter_count should equal MAX_VOTER_COUNT after {} votes",
        cap
    );

    // The (cap + 1)-th voter must get MaxVotersReached.
    let overflow_voter = &voters[cap];
    let result = gov.try_cast_vote(overflow_voter, &proposal_id, &Vote::Yes);
    assert_eq!(
        result,
        Err(Ok(ContractError::MaxVotersReached)),
        "cast_vote should return MaxVotersReached when voter_count == MAX_VOTER_COUNT"
    );
}

/// Verify that votes below the cap all succeed without error.
#[test]
fn test_votes_below_cap_succeed() {
    let env = Env::default();
    let n = 5u32;
    let (gov, _, voters) = setup_with_voters(&env, n);

    let proposal_id = gov.create_proposal(
        &voters.get(0).unwrap(),
        &String::from_str(&env, "Small Proposal"),
        &String::from_str(&env, "desc"),
        &5_000_000i128,
        &604_800u64,
        &None,
        &None,
    );

    for i in 0..n {
        let voter = voters.get(i).unwrap();
        gov.cast_vote(&voter, &proposal_id, &Vote::Yes);
        assert!(gov.has_voted(&proposal_id, &voter));
    }

    let proposal = gov.get_proposal(&proposal_id);
    assert_eq!(proposal.voter_count, n, "voter_count should match number of votes cast");
}
