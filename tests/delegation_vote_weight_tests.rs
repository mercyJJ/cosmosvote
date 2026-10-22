//! Integration tests for token delegation and vote weight computation.
//!
//! Covers issue #105: Alice delegates to Bob, Bob votes, verify Bob's vote
//! weight includes Alice's tokens. Also covers undelegation.

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env, String};
use cosmosvote_token::{TokenContract, TokenContractClient};
use cosmosvote_governance::{GovernanceContract, GovernanceContractClient};
use cosmosvote_governance::Vote;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/// Initialise token + governance; mint 3_000 to Alice and 2_000 to Bob.
fn setup_delegation_env() -> (
    Env,
    // We return addresses and contract IDs so callers can build clients
    Address, // token_id
    Address, // gov_id
    Address, // admin
    Address, // alice
    Address, // bob
) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    // Deploy token
    let token_id = env.register(TokenContract, ());
    let token = TokenContractClient::new(&env, &token_id);
    token.initialize(
        &admin,
        &1_000_000_000i128,
        &String::from_str(&env, "CosmosVote"),
        &String::from_str(&env, "VOTE"),
        &7u32,
    );

    // Mint tokens: Alice 3_000, Bob 2_000
    token.mint(&admin, &alice, &3_000i128);
    token.mint(&admin, &bob, &2_000i128);

    // Deploy governance
    let gov_id = env.register(GovernanceContract, ());
    let gov = GovernanceContractClient::new(&env, &gov_id);
    gov.initialize(
        &admin,
        &token_id,
        &0i128,  // min_proposal_balance: none
        &0u64,   // proposal_cooldown: none
        &0u32,   // min_quorum_bps: none
        &false,  // restrict_admin_vote
        &None,   // treasury
        &0u32,   // concentration_threshold_bps: disabled
    );

    (env, token_id, gov_id, admin, alice, bob)
}

// ---------------------------------------------------------------------------
// Helper: create a standard proposal
// ---------------------------------------------------------------------------

fn create_test_proposal(env: &Env, gov: &GovernanceContractClient<'_>, proposer: &Address) -> u64 {
    gov.create_proposal(
        proposer,
        &String::from_str(env, "Delegation test proposal"),
        &String::from_str(env, "Test that delegated voting weight is counted correctly"),
        &1i128,       // quorum = 1 token (easily met)
        &3_600u64,    // 1 hour
        &None,        // no execution payload
        &None,        // no link
    )
}

// ---------------------------------------------------------------------------
// Test: Alice delegates to Bob — Bob votes with both balances.
// ---------------------------------------------------------------------------

#[test]
fn test_delegated_tokens_are_included_in_delegate_vote_weight() {
    let (env, token_id, gov_id, admin, alice, bob) = setup_delegation_env();
    env.mock_all_auths();

    let token = TokenContractClient::new(&env, &token_id);
    let gov = GovernanceContractClient::new(&env, &gov_id);

    // Verify initial balances
    assert_eq!(token.balance(&alice), 3_000i128, "alice should start with 3_000");
    assert_eq!(token.balance(&bob), 2_000i128, "bob should start with 2_000");

    // Alice delegates to Bob
    token.delegate(&alice, &bob);

    // Confirm delegation is recorded
    let alice_delegate = token.get_delegation(&alice);
    assert_eq!(alice_delegate, Some(bob.clone()), "alice should be delegated to bob");

    // Bob has no delegation set
    assert!(token.get_delegation(&bob).is_none(), "bob should not be delegating");

    // Create a proposal (admin creates so neither Alice nor Bob burn a cooldown)
    let id = create_test_proposal(&env, &gov, &admin);

    // Alice cannot vote — she has delegated her power away
    let alice_result = gov.try_cast_vote(&alice, &id, &Vote::Yes);
    assert!(
        alice_result.is_err(),
        "alice must not be able to vote while delegating"
    );

    // Bob votes with his balance plus Alice's delegated balance.
    gov.cast_vote(&bob, &id, &Vote::Yes);

    let proposal = gov.get_proposal(&id);
    assert_eq!(
        proposal.votes_yes, 5_000i128,
        "vote weight should include bob's and alice's balances"
    );
    assert_eq!(proposal.votes_no, 0i128);
    assert_eq!(proposal.votes_abstain, 0i128);
    assert_eq!(proposal.voter_count, 1u32);
}

// ---------------------------------------------------------------------------
// Test: the token tracks delegators and accumulates their balances.
// ---------------------------------------------------------------------------

#[test]
fn test_get_delegated_weight_accumulates_alice_and_bob() {
    let (env, token_id, _gov_id, _admin, alice, bob) = setup_delegation_env();
    env.mock_all_auths();

    let token = TokenContractClient::new(&env, &token_id);

    // Alice delegates to Bob
    token.delegate(&alice, &bob);

    // Bob's standalone balance
    let bob_balance = token.balance(&bob);
    assert_eq!(bob_balance, 2_000i128);

    let delegators = token.get_delegators(&bob);
    assert_eq!(delegators.len(), 1);
    assert_eq!(delegators.get(0), Some(alice.clone()));
    let weight = token.get_delegated_weight(&bob, &delegators);
    assert_eq!(
        weight,
        5_000i128, // bob 2_000 + alice 3_000
        "delegated weight must equal bob's balance plus alice's balance"
    );
}

// ---------------------------------------------------------------------------
// Test: Undelegation — after Alice undelegates, Bob's weight reverts.
// ---------------------------------------------------------------------------

#[test]
fn test_undelegation_reverts_vote_weight() {
    let (env, token_id, gov_id, admin, alice, bob) = setup_delegation_env();
    env.mock_all_auths();

    let token = TokenContractClient::new(&env, &token_id);
    let gov = GovernanceContractClient::new(&env, &gov_id);

    // Alice delegates to Bob, then undelegates
    token.delegate(&alice, &bob);
    assert_eq!(token.get_delegation(&alice), Some(bob.clone()));

    token.undelegate(&alice);
    assert_eq!(
        token.get_delegation(&alice),
        None,
        "alice's delegation must be cleared after undelegation"
    );
    assert!(token.get_delegators(&bob).is_empty());

    // After undelegation Alice can vote directly again
    let id = create_test_proposal(&env, &gov, &admin);

    gov.cast_vote(&alice, &id, &Vote::Yes);

    let proposal = gov.get_proposal(&id);
    assert_eq!(
        proposal.votes_yes, 3_000i128,
        "alice's vote weight should be her own balance (3_000) after undelegation"
    );

    // Bob votes separately; his weight should be his own balance only
    gov.cast_vote(&bob, &id, &Vote::No);

    let proposal = gov.get_proposal(&id);
    assert_eq!(
        proposal.votes_no, 2_000i128,
        "bob's vote weight should be his own balance (2_000)"
    );
    assert_eq!(proposal.voter_count, 2u32);
}

// ---------------------------------------------------------------------------
// Test: Delegation cycle is rejected.
// ---------------------------------------------------------------------------

#[test]
fn test_delegation_cycle_rejected() {
    let (env, token_id, _gov_id, _admin, alice, bob) = setup_delegation_env();
    env.mock_all_auths();

    let token = TokenContractClient::new(&env, &token_id);

    // Bob delegates to Alice first
    token.delegate(&bob, &alice);
    assert_eq!(token.get_delegation(&bob), Some(alice.clone()));

    // Alice now tries to delegate to Bob — this would form a cycle
    let result = token.try_delegate(&alice, &bob);
    assert!(
        result.is_err(),
        "delegation cycle (alice→bob when bob→alice exists) must be rejected"
    );
}

// ---------------------------------------------------------------------------
// Test: Self-delegation is rejected.
// ---------------------------------------------------------------------------

#[test]
fn test_self_delegation_rejected() {
    let (env, token_id, _gov_id, _admin, alice, _bob) = setup_delegation_env();
    env.mock_all_auths();

    let token = TokenContractClient::new(&env, &token_id);

    let result = token.try_delegate(&alice, &alice);
    assert!(result.is_err(), "self-delegation must be rejected");
}

