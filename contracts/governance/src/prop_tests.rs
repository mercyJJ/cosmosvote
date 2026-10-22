//! Governance contract — property-based tests.
//!
//! Two `proptest!` blocks are used:
//! * a fast block (10 cases) for the original invariants, and
//! * a 1000-case block for the new state-machine invariants added in #66:
//!   - `cast_vote` on a non-`Active` proposal always errors,
//!   - `finalise` on an already-finalised proposal always errors,
//!   - the vote tally never exceeds total supply.

#![cfg(test)]

use proptest::prelude::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};
use cosmosvote_token::{TokenContract, TokenContractClient};
use crate::{
    types::{ProposalState, Vote},
    GovernanceContract, GovernanceContractClient,
};

/// Stand up a token + governance pair and fund `voter` with `weight`.
/// Returns `(token, gov, admin)` so each test can drive the lifecycle.
fn harness(
    env: &Env,
    voter: &Address,
    weight: i128,
) -> (TokenContractClient<'_>, GovernanceContractClient<'_>, Address) {
    let admin = Address::generate(env);
    let token_id = env.register(TokenContract, ());
    let token = TokenContractClient::new(env, &token_id);
    token.initialize(
        &admin,
        &1_000_000_000i128,
        &String::from_str(env, "CosmosVote"),
        &String::from_str(env, "VOTE"),
        &7u32,
    );
    token.mint(&admin, voter, &weight);
    let gov_id = env.register(GovernanceContract, ());
    let gov = GovernanceContractClient::new(env, &gov_id);
    gov.initialize(&admin, &token_id, &0i128, &0u64, &0u32, &false, &None, &0u32);
    (token, gov, admin)
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(10))]

    #[test]
    fn prop_no_double_vote(yes_weight in 1..100_000_000i128) {
        let env = Env::default();
        env.mock_all_auths();
        let voter = Address::generate(&env);
        let (_token, gov, _admin) = harness(&env, &voter, yes_weight);

        let id = gov.create_proposal(
            &voter,
            &String::from_str(&env, "Prop"),
            &String::from_str(&env, "Description"),
            &1i128,
            &3600u64,
            &None,
            &None,
        );

        gov.cast_vote(&voter, &id, &Vote::Yes);
        prop_assert!(gov.has_voted(&id, &voter));

        let result = gov.try_cast_vote(&voter, &id, &Vote::No);
        prop_assert!(result.is_err());
    }

    #[test]
    fn prop_vote_arithmetic_overflow_prevented(
        yes_weight in 100_000_000_000_000_000_000_000_000_000_000i128..i128::MAX,
        no_weight in 100_000_000_000_000_000_000_000_000_000_000i128..i128::MAX
    ) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let voter_a = Address::generate(&env);
        let voter_b = Address::generate(&env);

        let token_id = env.register(TokenContract, ());
        let token = TokenContractClient::new(&env, &token_id);
        token.initialize(
            &admin,
            &i128::MAX,
            &String::from_str(&env, "CosmosVote"),
            &String::from_str(&env, "VOTE"),
            &7u32,
        );
        token.mint(&admin, &voter_a, &yes_weight);
        token.mint(&admin, &voter_b, &no_weight);

        let gov_id = env.register(GovernanceContract, ());
        let gov = GovernanceContractClient::new(&env, &gov_id);
        gov.initialize(&admin, &token_id, &0i128, &0u64, &0u32, &false, &None, &0u32);

        let id = gov.create_proposal(
            &voter_a,
            &String::from_str(&env, "Overflow Test"),
            &String::from_str(&env, "Total votes must not exceed i128::MAX"),
            &1i128,
            &3600u64,
            &None,
            &None,
        );

        gov.cast_vote(&voter_a, &id, &Vote::Yes);

        // This should fail with ArithmeticOverflow if yes + no > i128::MAX.
        let result = gov.try_cast_vote(&voter_b, &id, &Vote::No);
        if yes_weight.checked_add(no_weight).is_none() {
            prop_assert!(result.is_err());
        } else {
            prop_assert!(result.is_ok());
        }
    }

    /// A tied vote (yes == no) is always rejected.
    #[test]
    fn prop_tie_results_in_rejection(
        tie_weight in 1_000_000i128..10_000_000i128,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let voter_yes = Address::generate(&env);
        let voter_no = Address::generate(&env);

        let token_id = env.register(TokenContract, ());
        let token = TokenContractClient::new(&env, &token_id);
        token.initialize(
            &admin,
            &1_000_000_000i128,
            &String::from_str(&env, "CosmosVote"),
            &String::from_str(&env, "VOTE"),
            &7u32,
        );
        token.mint(&admin, &voter_yes, &tie_weight);
        token.mint(&admin, &voter_no, &tie_weight);

        let gov_id = env.register(GovernanceContract, ());
        let gov = GovernanceContractClient::new(&env, &gov_id);
        gov.initialize(&admin, &token_id, &0i128, &0u64, &0u32, &false, &None, &0u32);

        let quorum = tie_weight; // total will be 2*tie_weight >= quorum
        let id = gov.create_proposal(
            &voter_yes,
            &String::from_str(&env, "Tie Test"),
            &String::from_str(&env, "Should be rejected on tie"),
            &quorum,
            &3600u64,
            &None,
            &None,
        );

        gov.cast_vote(&voter_yes, &id, &Vote::Yes);
        gov.cast_vote(&voter_no, &id, &Vote::No);

        let proposal = gov.get_proposal(&id);
        env.ledger().with_mut(|l| l.timestamp = proposal.end_time + 1);
        gov.finalise(&id);

        prop_assert_eq!(gov.get_proposal(&id).state, ProposalState::Rejected);
    }

    /// Abstain votes count toward quorum: yes+no+abstain >= quorum with yes > no passes.
    #[test]
    fn prop_abstain_counts_toward_quorum(
        yes_weight in 4_000_000i128..8_000_000i128,
        no_weight in 1_000_000i128..3_000_000i128,
        abstain_weight in 1_000_000i128..5_000_000i128,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let voter_yes = Address::generate(&env);
        let voter_no = Address::generate(&env);
        let voter_abs = Address::generate(&env);

        let token_id = env.register(TokenContract, ());
        let token = TokenContractClient::new(&env, &token_id);
        token.initialize(
            &admin,
            &1_000_000_000i128,
            &String::from_str(&env, "CosmosVote"),
            &String::from_str(&env, "VOTE"),
            &7u32,
        );
        token.mint(&admin, &voter_yes, &yes_weight);
        token.mint(&admin, &voter_no, &no_weight);
        token.mint(&admin, &voter_abs, &abstain_weight);

        let gov_id = env.register(GovernanceContract, ());
        let gov = GovernanceContractClient::new(&env, &gov_id);
        gov.initialize(&admin, &token_id, &0i128, &0u64, &0u32, &false, &None, &0u32);

        let total = yes_weight + no_weight + abstain_weight;
        let quorum = yes_weight + no_weight + 1; // requires abstain to meet quorum
        prop_assume!(total >= quorum);

        let id = gov.create_proposal(
            &voter_yes,
            &String::from_str(&env, "Abstain Quorum Test"),
            &String::from_str(&env, "Abstain pushes over quorum"),
            &quorum,
            &3600u64,
            &None,
            &None,
        );

        gov.cast_vote(&voter_yes, &id, &Vote::Yes);
        gov.cast_vote(&voter_no, &id, &Vote::No);
        gov.cast_vote(&voter_abs, &id, &Vote::Abstain);

        let proposal = gov.get_proposal(&id);
        env.ledger().with_mut(|l| l.timestamp = proposal.end_time + 1);
        gov.finalise(&id);

        // yes > no and total >= quorum => Passed
        prop_assert_eq!(gov.get_proposal(&id).state, ProposalState::Passed);
    }

    /// When total votes < quorum, proposal is always rejected regardless of yes/no split.
    #[test]
    fn prop_quorum_not_met_always_rejected(
        yes_weight in 1_000_000i128..10_000_000i128,
        no_weight in 1_000_000i128..10_000_000i128,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let voter_yes = Address::generate(&env);
        let voter_no = Address::generate(&env);

        let token_id = env.register(TokenContract, ());
        let token = TokenContractClient::new(&env, &token_id);
        token.initialize(
            &admin,
            &1_000_000_000i128,
            &String::from_str(&env, "CosmosVote"),
            &String::from_str(&env, "VOTE"),
            &7u32,
        );
        token.mint(&admin, &voter_yes, &yes_weight);
        token.mint(&admin, &voter_no, &no_weight);

        let gov_id = env.register(GovernanceContract, ());
        let gov = GovernanceContractClient::new(&env, &gov_id);
        gov.initialize(&admin, &token_id, &0i128, &0u64, &0u32, &false, &None, &0u32);

        let total = yes_weight + no_weight;
        let quorum = total + 1; // always one more than total votes cast

        let id = gov.create_proposal(
            &voter_yes,
            &String::from_str(&env, "Quorum Miss Test"),
            &String::from_str(&env, "Quorum not met"),
            &quorum,
            &3600u64,
            &None,
            &None,
        );

        gov.cast_vote(&voter_yes, &id, &Vote::Yes);
        gov.cast_vote(&voter_no, &id, &Vote::No);

        let proposal = gov.get_proposal(&id);
        env.ledger().with_mut(|l| l.timestamp = proposal.end_time + 1);
        gov.finalise(&id);

        prop_assert_eq!(gov.get_proposal(&id).state, ProposalState::Rejected);
    }
}

// ---------------------------------------------------------------------------
// New state-machine invariants (issue #66) — 1000 cases each.
// ---------------------------------------------------------------------------

proptest! {
    #![proptest_config(ProptestConfig::with_cases(1000))]

    /// Invariant: `cast_vote` on a non-`Active` proposal ALWAYS returns an error,
    /// regardless of which terminal state the proposal reached (Passed, Rejected,
    /// Cancelled) or which vote choice is attempted.
    #[test]
    fn prop_vote_on_non_active_always_rejected(
        weight in 1..50_000_000i128,
        terminal in 0u8..3u8,       // 0 = Passed, 1 = Rejected, 2 = Cancelled
        choice in 0u8..3u8,         // 0 = Yes, 1 = No, 2 = Abstain
    ) {
        let env = Env::default();
        env.mock_all_auths();
        let voter = Address::generate(&env);
        let (token, gov, admin) = harness(&env, &voter, weight);

        // quorum is low so a single Yes vote is enough to pass when we want Passed.
        let id = gov.create_proposal(
            &voter,
            &String::from_str(&env, "Non-Active Vote Test"),
            &String::from_str(&env, "Voting after terminal state must fail"),
            &1i128,
            &3600u64,
            &None,
            &None,
        );

        // Drive the proposal into the requested terminal state.
        match terminal {
            0 => {
                // Passed: cast a Yes vote, advance, finalise.
                gov.cast_vote(&voter, &id, &Vote::Yes);
                let p = gov.get_proposal(&id);
                env.ledger().with_mut(|l| l.timestamp = p.end_time + 1);
                gov.finalise(&id);
                prop_assert_eq!(gov.get_proposal(&id).state, ProposalState::Passed);
            }
            1 => {
                // Rejected: no votes cast, advance, finalise (quorum not met).
                let p = gov.get_proposal(&id);
                env.ledger().with_mut(|l| l.timestamp = p.end_time + 1);
                gov.finalise(&id);
                prop_assert_eq!(gov.get_proposal(&id).state, ProposalState::Rejected);
            }
            _ => {
                // Cancelled: admin cancels while still Active.
                gov.cancel(&admin, &id, &None);
                prop_assert_eq!(gov.get_proposal(&id).state, ProposalState::Cancelled);
            }
        }

        // A fresh voter (so AlreadyVoted cannot be the cause of the error) tries to vote.
        let fresh = Address::generate(&env);
        token.mint(&admin, &fresh, &weight);

        let vote = match choice {
            0 => Vote::Yes,
            1 => Vote::No,
            _ => Vote::Abstain,
        };
        let result = gov.try_cast_vote(&fresh, &id, &vote);
        prop_assert!(
            result.is_err(),
            "cast_vote on non-Active proposal should error (state = {:?})",
            gov.get_proposal(&id).state
        );
    }

    /// Invariant: `finalise` on an already-finalised proposal ALWAYS returns an error.
    /// This holds whether the first finalisation produced Passed or Rejected.
    #[test]
    fn prop_finalise_twice_always_errors(
        weight in 1..50_000_000i128,
        pass in any::<bool>(),      // true => first finalise yields Passed, false => Rejected
    ) {
        let env = Env::default();
        env.mock_all_auths();
        let voter = Address::generate(&env);
        let (_token, gov, _admin) = harness(&env, &voter, weight);

        let quorum = if pass { 1 } else { weight + 1 }; // pass needs quorum met; reject needs it missed
        let id = gov.create_proposal(
            &voter,
            &String::from_str(&env, "Double Finalise Test"),
            &String::from_str(&env, "Finalising twice must error"),
            &quorum,
            &3600u64,
            &None,
            &None,
        );

        if pass {
            gov.cast_vote(&voter, &id, &Vote::Yes);
        }

        let p = gov.get_proposal(&id);
        env.ledger().with_mut(|l| l.timestamp = p.end_time + 1);

        // First finalise must succeed.
        let first = gov.try_finalise(&id);
        prop_assert!(first.is_ok(), "first finalise should succeed");
        prop_assert!(gov.get_proposal(&id).state != ProposalState::Active);

        // Second finalise must error (ProposalNotActive).
        let second = gov.try_finalise(&id);
        prop_assert!(second.is_err(), "finalising twice should error");
    }

    /// Invariant: the vote tally (yes + no + abstain) NEVER exceeds total supply.
    /// Each voter's weight is drawn from their token balance, whose sum is bounded
    /// by total_supply, so the running tally must stay <= total_supply.
    #[test]
    fn prop_tally_never_exceeds_total_supply(
        yes_w in 1..100_000_000i128,
        no_w in 1..100_000_000i128,
        abs_w in 1..100_000_000i128,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let voter_yes = Address::generate(&env);
        let voter_no = Address::generate(&env);
        let voter_abs = Address::generate(&env);

        let token_id = env.register(TokenContract, ());
        let token = TokenContractClient::new(&env, &token_id);
        token.initialize(
            &admin,
            &1_000_000_000i128,
            &String::from_str(&env, "CosmosVote"),
            &String::from_str(&env, "VOTE"),
            &7u32,
        );
        token.mint(&admin, &voter_yes, &yes_w);
        token.mint(&admin, &voter_no, &no_w);
        token.mint(&admin, &voter_abs, &abs_w);

        let gov_id = env.register(GovernanceContract, ());
        let gov = GovernanceContractClient::new(&env, &gov_id);
        gov.initialize(&admin, &token_id, &0i128, &0u64, &0u32, &false, &None, &0u32);

        let id = gov.create_proposal(
            &voter_yes,
            &String::from_str(&env, "Tally Bound Test"),
            &String::from_str(&env, "tally must stay <= total supply"),
            &1i128,
            &3600u64,
            &None,
            &None,
        );

        gov.cast_vote(&voter_yes, &id, &Vote::Yes);
        gov.cast_vote(&voter_no, &id, &Vote::No);
        gov.cast_vote(&voter_abs, &id, &Vote::Abstain);

        let p = gov.get_proposal(&id);
        let tally = p.votes_yes + p.votes_no + p.votes_abstain;
        let supply = token.total_supply();
        prop_assert!(
            tally <= supply,
            "tally ({}) must not exceed total supply ({})",
            tally,
            supply
        );
        // Sanity: tally equals the sum of the three weights (no double counting).
        prop_assert_eq!(tally, yes_w + no_w + abs_w);
    }
}
