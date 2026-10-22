//! Token contract — unit tests.

#![cfg(test)]

use soroban_sdk::{testutils::{Address as _, Ledger}, Address, Env, String};

use crate::{types::ContractError, TokenContract, TokenContractClient};

fn setup(env: &Env) -> (TokenContractClient, Address, Address) {
    env.mock_all_auths();
    let admin = Address::generate(env);
    let user = Address::generate(env);
    let id = env.register(TokenContract, ());
    let token = TokenContractClient::new(env, &id);
    token.initialize(
        &admin,
        &1_000_000_000i128,
        &String::from_slice(env, "CosmosVote"),
        &String::from_slice(env, "VOTE"),
        &7u32,
    );
    (token, admin, user)
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

#[test]
fn test_initialize() {
    let env = Env::default();
    let (token, admin, _) = setup(&env);
    assert_eq!(token.total_supply(), 1_000_000_000);
    assert_eq!(token.balance(&admin), 1_000_000_000);
}

#[test]
fn test_double_init_fails() {
    let env = Env::default();
    let (token, admin, _) = setup(&env);
    let result = token.try_initialize(
        &admin,
        &1_000_000i128,
        &String::from_slice(&env, "Coin"),
        &String::from_slice(&env, "COIN"),
        &7u32,
    );
    assert_eq!(result, Err(Ok(ContractError::AlreadyInitialized)));
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

#[test]
fn test_transfer() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    token.transfer(&admin, &user, &1_000_000i128);
    assert_eq!(token.balance(&user), 1_000_000);
    assert_eq!(token.balance(&admin), 999_000_000);
}

#[test]
fn test_transfer_insufficient_balance_fails() {
    let env = Env::default();
    let (token, _, user) = setup(&env);
    let result = token.try_transfer(&user, &Address::generate(&env), &1i128);
    assert_eq!(result, Err(Ok(ContractError::InsufficientBalance)));
}

#[test]
fn test_transfer_zero_fails() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    let result = token.try_transfer(&admin, &user, &0i128);
    assert_eq!(result, Err(Ok(ContractError::InvalidAmount)));
}

#[test]
fn test_transfer_to_self_noop() {
    let env = Env::default();
    let (token, admin, _) = setup(&env);
    token.transfer(&admin, &admin, &1_000_000i128);
    assert_eq!(token.balance(&admin), 1_000_000_000);
}

// ---------------------------------------------------------------------------
// Allowances
// ---------------------------------------------------------------------------

#[test]
fn test_approve_and_transfer_from() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    let spender = Address::generate(&env);
    let expiry = env.ledger().sequence() + 10;
    token.approve(&admin, &spender, &5_000_000i128, &expiry);
    assert_eq!(token.allowance(&admin, &spender), 5_000_000);
    token.transfer_from(&spender, &admin, &user, &2_000_000i128);
    assert_eq!(token.balance(&user), 2_000_000);
    assert_eq!(token.allowance(&admin, &spender), 3_000_000);
}

#[test]
fn test_transfer_from_exceeds_allowance_fails() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    let spender = Address::generate(&env);
    let expiry = env.ledger().sequence() + 10;
    token.approve(&admin, &spender, &100i128, &expiry);
    let result = token.try_transfer_from(&spender, &admin, &user, &200i128);
    assert_eq!(result, Err(Ok(ContractError::AllowanceExceeded)));
}

#[test]
fn test_transfer_from_expired_allowance_fails() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    let spender = Address::generate(&env);
    let expiry = env.ledger().sequence() + 1;
    token.approve(&admin, &spender, &1_000_000i128, &expiry);
    env.ledger().with_mut(|l| l.sequence_number = expiry + 1);
    let result = token.try_transfer_from(&spender, &admin, &user, &1_000_000i128);
    assert_eq!(result, Err(Ok(ContractError::AllowanceExceeded)));
}

// ---------------------------------------------------------------------------
// Mint & burn
// ---------------------------------------------------------------------------

#[test]
fn test_mint() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    token.mint(&admin, &user, &5_000_000i128);
    assert_eq!(token.balance(&user), 5_000_000);
    assert_eq!(token.total_supply(), 1_005_000_000);
}

#[test]
fn test_burn() {
    let env = Env::default();
    let (token, admin, _) = setup(&env);
    token.burn(&admin, &admin, &100_000_000i128);
    assert_eq!(token.total_supply(), 900_000_000);
    assert_eq!(token.balance(&admin), 900_000_000);
}

#[test]
fn test_burn_insufficient_fails() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    let result = token.try_burn(&admin, &user, &1i128);
    assert_eq!(result, Err(Ok(ContractError::InsufficientBalance)));
}

#[test]
fn test_burn_self() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);

    token.transfer(&admin, &user, &1_000_000i128);
    token.burn_self(&user, &500_000i128);

    assert_eq!(token.balance(&user), 500_000);
    assert_eq!(token.total_supply(), 999_500_000);
}

#[test]
fn test_burn_self_insufficient_balance_fails() {
    let env = Env::default();
    let (token, _, user) = setup(&env);
    let result = token.try_burn_self(&user, &1_000_000i128);
    assert_eq!(result, Err(Ok(ContractError::InsufficientBalance)));
}

#[test]
fn test_mint_non_admin_fails() {
    let env = Env::default();
    let (token, _, user) = setup(&env);
    let result = token.try_mint(&user, &user, &1_000i128);
    assert_eq!(result, Err(Ok(ContractError::NotAdmin)));
}

#[test]
fn test_burn_reduces_total_supply() {
    let env = Env::default();
    let (token, admin, _) = setup(&env);
    token.burn(&admin, &admin, &200_000_000i128);
    assert_eq!(token.total_supply(), 800_000_000);
    assert_eq!(token.balance(&admin), 800_000_000);
}

#[test]
fn test_burn_insufficient_balance_fails() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    let result = token.try_burn(&admin, &user, &1i128);
    assert_eq!(result, Err(Ok(ContractError::InsufficientBalance)));
}

#[test]
fn test_burn_non_admin_fails() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    token.transfer(&admin, &user, &1_000_000i128);
    let result = token.try_burn(&user, &user, &1_000_000i128);
    assert_eq!(result, Err(Ok(ContractError::NotAdmin)));
}

// ---------------------------------------------------------------------------
// Admin transfer
// ---------------------------------------------------------------------------

#[test]
fn test_admin_transfer_happy_path() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    
    // Step 1: Propose
    token.propose_admin(&admin, &user);
    assert_eq!(token.admin(), admin); // Still old admin
    
    // Step 2: Accept
    token.accept_admin(&user);
    assert_eq!(token.admin(), user); // Now new admin
}

#[test]
fn test_propose_admin_non_admin_fails() {
    let env = Env::default();
    let (token, _, user) = setup(&env);
    let result = token.try_propose_admin(&user, &Address::generate(&env));
    assert_eq!(result, Err(Ok(ContractError::NotAdmin)));
}

#[test]
fn test_accept_admin_not_pending_fails() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    
    let result = token.try_accept_admin(&user);
    assert_eq!(result, Err(Ok(ContractError::NoPendingAdmin)));

    token.propose_admin(&admin, &user);
    let random = Address::generate(&env);
    let result = token.try_accept_admin(&random);
    assert_eq!(result, Err(Ok(ContractError::NotPendingAdmin)));
}

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

#[test]
fn test_version() {
    let env = Env::default();
    let (token, _, _) = setup(&env);
    assert_eq!(token.version(), (1u32, 0u32, 0u32));

    env.as_contract(&token.address, || {
        crate::storage::TokenStorage::set_version(&env, (2, 1, 0));
    });
    assert_eq!(token.version(), (2u32, 1u32, 0u32));
}

// ---------------------------------------------------------------------------
// SEP-41 Metadata
// ---------------------------------------------------------------------------

#[test]
fn test_metadata_name() {
    let env = Env::default();
    let (token, _, _) = setup(&env);
    assert_eq!(token.name(), String::from_slice(&env, "CosmosVote"));
}

#[test]
fn test_metadata_symbol() {
    let env = Env::default();
    let (token, _, _) = setup(&env);
    assert_eq!(token.symbol(), String::from_slice(&env, "VOTE"));
}

#[test]
fn test_metadata_decimals() {
    let env = Env::default();
    let (token, _, _) = setup(&env);
    assert_eq!(token.decimals(), 7u32);
}

#[test]
fn test_metadata_custom_values() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let id = env.register(TokenContract, ());
    let token = TokenContractClient::new(&env, &id);
    token.initialize(
        &admin,
        &500_000i128,
        &String::from_slice(&env, "My Token"),
        &String::from_slice(&env, "MTK"),
        &18u32,
    );
    assert_eq!(token.name(), String::from_slice(&env, "My Token"));
    assert_eq!(token.symbol(), String::from_slice(&env, "MTK"));
    assert_eq!(token.decimals(), 18u32);
}

#[test]
fn test_delegate_and_get_delegation() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    let delegate = Address::generate(&env);

    token.transfer(&admin, &user, &1_000_000i128);
    token.delegate(&user, &delegate);

    assert_eq!(token.get_delegation(&user), Some(delegate));
}

#[test]
fn test_delegate_self_fails() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    token.transfer(&admin, &user, &1_000_000i128);

    let result = token.try_delegate(&user, &user);
    assert_eq!(result, Err(Ok(ContractError::CannotDelegateSelf)));
}

#[test]
fn test_delegate_twice_fails() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    let delegate = Address::generate(&env);
    let delegate2 = Address::generate(&env);

    token.transfer(&admin, &user, &1_000_000i128);
    token.delegate(&user, &delegate);

    let result = token.try_delegate(&user, &delegate2);
    assert_eq!(result, Err(Ok(ContractError::AlreadyDelegating)));
}

#[test]
fn test_undelegate() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    let delegate = Address::generate(&env);

    token.transfer(&admin, &user, &1_000_000i128);
    token.delegate(&user, &delegate);
    token.undelegate(&user);

    assert_eq!(token.get_delegation(&user), None);
}

#[test]
fn test_undelegate_without_delegation_fails() {
    let env = Env::default();
    let (token, _, user) = setup(&env);

    let result = token.try_undelegate(&user);
    assert_eq!(result, Err(Ok(ContractError::NotDelegating)));
}

#[test]
fn test_get_delegated_weight_no_delegators() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    token.transfer(&admin, &user, &5_000_000i128);

    let weight = token.get_delegated_weight(&user, &soroban_sdk::Vec::new(&env));
    assert_eq!(weight, 5_000_000);
}

#[test]
fn test_get_delegated_weight_with_delegator() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    let delegator = Address::generate(&env);

    token.transfer(&admin, &user, &5_000_000i128);
    token.mint(&admin, &delegator, &3_000_000i128);
    token.delegate(&delegator, &user);

    let mut delegators = soroban_sdk::Vec::new(&env);
    delegators.push_back(delegator);
    let weight = token.get_delegated_weight(&user, &delegators);
    assert_eq!(weight, 8_000_000); // 5M own + 3M delegated
}

#[test]
fn test_get_delegated_weight_ignores_wrong_delegator() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    let other = Address::generate(&env);
    let unrelated = Address::generate(&env);

    token.transfer(&admin, &user, &5_000_000i128);
    token.mint(&admin, &other, &2_000_000i128);
    // other delegates to unrelated, not to user
    token.delegate(&other, &unrelated);

    let mut delegators = soroban_sdk::Vec::new(&env);
    delegators.push_back(other);
    let weight = token.get_delegated_weight(&user, &delegators);
    assert_eq!(weight, 5_000_000); // only own balance
}

// ---------------------------------------------------------------------------
// Pause / unpause
// ---------------------------------------------------------------------------

#[test]
fn test_pause_blocks_transfer() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    token.pause(&admin);
    assert!(token.is_paused());
    let result = token.try_transfer(&admin, &user, &1_000i128);
    assert_eq!(result, Err(Ok(ContractError::ContractPaused)));
}

#[test]
fn test_pause_blocks_transfer_from() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    let spender = Address::generate(&env);
    token.approve(&admin, &spender, &1_000i128);
    token.pause(&admin);
    let result = token.try_transfer_from(&spender, &admin, &user, &100i128);
    assert_eq!(result, Err(Ok(ContractError::ContractPaused)));
}

#[test]
fn test_unpause_restores_transfer() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    token.pause(&admin);
    token.unpause(&admin);
    assert!(!token.is_paused());
    token.transfer(&admin, &user, &1_000i128);
    assert_eq!(token.balance(&user), 1_000);
}

#[test]
fn test_pause_non_admin_fails() {
    let env = Env::default();
    let (token, _, user) = setup(&env);
    let result = token.try_pause(&user);
    assert_eq!(result, Err(Ok(ContractError::NotAdmin)));
}

#[test]
fn test_unpause_non_admin_fails() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    token.pause(&admin);
    let result = token.try_unpause(&user);
    assert_eq!(result, Err(Ok(ContractError::NotAdmin)));
}

// ---------------------------------------------------------------------------
// Issue #303 — Token pause safety: transfer freeze guard
// ---------------------------------------------------------------------------

/// Pausing the contract must freeze all transfers immediately. Balances must
/// remain unchanged after a blocked attempt.
#[test]
fn test_pause_transfer_freeze_balances_unchanged() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);

    let admin_balance_before = token.balance(&admin);
    let user_balance_before = token.balance(&user);

    token.pause(&admin);

    // Transfer attempt must fail
    let result = token.try_transfer(&admin, &user, &500_000i128);
    assert_eq!(result, Err(Ok(ContractError::ContractPaused)));

    // Balances must be exactly as before
    assert_eq!(token.balance(&admin), admin_balance_before);
    assert_eq!(token.balance(&user), user_balance_before);
}

/// `transfer_from` must also be blocked when paused; the allowance is not
/// consumed and balances are unchanged.
#[test]
fn test_pause_transfer_from_freeze_allowance_unchanged() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    let spender = Address::generate(&env);

    let expiry = env.ledger().sequence() + 100;
    token.approve(&admin, &spender, &2_000i128, &expiry);
    assert_eq!(token.allowance(&admin, &spender), 2_000);

    token.pause(&admin);

    let result = token.try_transfer_from(&spender, &admin, &user, &500i128);
    assert_eq!(result, Err(Ok(ContractError::ContractPaused)));

    // Allowance must be unchanged
    assert_eq!(token.allowance(&admin, &spender), 2_000);
    // Balances must be unchanged
    assert_eq!(token.balance(&user), 0);
}

/// Unpausing must fully restore `transfer` functionality; subsequent transfers
/// succeed and produce correct balance changes.
#[test]
fn test_unpause_restores_transfer_from() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    let spender = Address::generate(&env);

    let expiry = env.ledger().sequence() + 100;
    token.approve(&admin, &spender, &10_000i128, &expiry);

    token.pause(&admin);
    // Blocked while paused
    assert!(token.try_transfer_from(&spender, &admin, &user, &1_000i128).is_err());

    token.unpause(&admin);
    // Succeeds after unpause
    token.transfer_from(&spender, &admin, &user, &1_000i128);
    assert_eq!(token.balance(&user), 1_000);
    assert_eq!(token.allowance(&admin, &spender), 9_000);
}

/// A contract that is already paused should return an error when paused again
/// (idempotency guard), or at minimum remain paused.
#[test]
fn test_double_pause_remains_paused() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);

    token.pause(&admin);
    assert!(token.is_paused());

    // Second pause: either idempotent or error — the contract must still be paused
    let _ = token.try_pause(&admin);
    assert!(token.is_paused());

    // Transfers must still be blocked
    let result = token.try_transfer(&admin, &user, &1_000i128);
    assert_eq!(result, Err(Ok(ContractError::ContractPaused)));
}

/// Multiple pause/unpause cycles must work correctly.
#[test]
fn test_multiple_pause_unpause_cycles() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);

    for _ in 0..3 {
        token.pause(&admin);
        assert!(token.is_paused());
        assert!(token.try_transfer(&admin, &user, &1_000i128).is_err());

        token.unpause(&admin);
        assert!(!token.is_paused());
        token.transfer(&admin, &user, &1_000i128); // must succeed
    }

    // After 3 cycles, user has received 3 × 1_000 tokens
    assert_eq!(token.balance(&user), 3_000);
}

/// Only the admin may pause — any non-admin address must be rejected.
#[test]
fn test_pause_admin_only_enforcement() {
    let env = Env::default();
    let (token, _, user) = setup(&env);

    let non_admin_1 = Address::generate(&env);
    let non_admin_2 = Address::generate(&env);

    for caller in [&user, &non_admin_1, &non_admin_2] {
        let result = token.try_pause(caller);
        assert_eq!(result, Err(Ok(ContractError::NotAdmin)), "non-admin {caller:?} must not pause");
    }
    // Contract remains unpaused
    assert!(!token.is_paused());
}

/// Only the admin may unpause — any non-admin address must be rejected.
#[test]
fn test_unpause_admin_only_enforcement() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);

    token.pause(&admin);

    let non_admin_1 = Address::generate(&env);
    let non_admin_2 = Address::generate(&env);

    for caller in [&user, &non_admin_1, &non_admin_2] {
        let result = token.try_unpause(caller);
        assert_eq!(result, Err(Ok(ContractError::NotAdmin)), "non-admin {caller:?} must not unpause");
    }
    // Contract remains paused
    assert!(token.is_paused());
}

/// `is_paused` must accurately reflect the contract state before, during, and
/// after a pause/unpause cycle.
#[test]
fn test_is_paused_reflects_state_accurately() {
    let env = Env::default();
    let (token, admin, _) = setup(&env);

    assert!(!token.is_paused(), "should not be paused on init");

    token.pause(&admin);
    assert!(token.is_paused(), "should be paused after pause()");

    token.unpause(&admin);
    assert!(!token.is_paused(), "should not be paused after unpause()");
}

/// Pausing must not affect read-only queries like `balance`, `allowance`,
/// `total_supply`, and `is_paused` itself.
#[test]
fn test_pause_does_not_block_read_queries() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    let spender = Address::generate(&env);

    let expiry = env.ledger().sequence() + 10;
    token.approve(&admin, &spender, &500i128, &expiry);
    token.pause(&admin);

    // Read queries must still work
    assert_eq!(token.total_supply(), 1_000_000_000);
    assert_eq!(token.balance(&admin), 1_000_000_000);
    assert_eq!(token.balance(&user), 0);
    assert_eq!(token.allowance(&admin, &spender), 500);
    assert!(token.is_paused());
}

// ---------------------------------------------------------------------------
// Delegation cycle detection (issue #63)
// ---------------------------------------------------------------------------

#[test]
fn test_delegate_cycle_a_to_b_b_to_a_fails() {
    let env = Env::default();
    let (token, admin, user_a) = setup(&env);
    let user_b = Address::generate(&env);

    token.transfer(&admin, &user_a, &1_000_000i128);
    token.mint(&admin, &user_b, &1_000_000i128);

    // A delegates to B — allowed
    token.delegate(&user_a, &user_b);
    assert_eq!(token.get_delegation(&user_a), Some(user_b.clone()));

    // B attempts to delegate to A — must fail with DelegationCycle
    let result = token.try_delegate(&user_b, &user_a);
    assert_eq!(result, Err(Ok(ContractError::DelegationCycle)));
}

#[test]
fn test_delegate_self_still_fails_with_cannot_delegate_self() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);
    token.transfer(&admin, &user, &1_000_000i128);

    let result = token.try_delegate(&user, &user);
    assert_eq!(result, Err(Ok(ContractError::CannotDelegateSelf)));
}

#[test]
fn test_delegate_after_undelegate_allows_reverse() {
    let env = Env::default();
    let (token, admin, user_a) = setup(&env);
    let user_b = Address::generate(&env);

    token.transfer(&admin, &user_a, &1_000_000i128);
    token.mint(&admin, &user_b, &1_000_000i128);

    // A → B, then A undelegates, then B → A should succeed (no cycle)
    token.delegate(&user_a, &user_b);
    token.undelegate(&user_a);
    token.delegate(&user_b, &user_a);
    assert_eq!(token.get_delegation(&user_b), Some(user_a.clone()));
}

#[test]
fn test_delegate_b_to_c_c_to_b_detected() {
    let env = Env::default();
    let (token, admin, user_b) = setup(&env);
    let user_c = Address::generate(&env);

    token.transfer(&admin, &user_b, &1_000_000i128);
    token.mint(&admin, &user_c, &1_000_000i128);

    // B → C first
    token.delegate(&user_b, &user_c);
    // C → B creates a cycle
    let result = token.try_delegate(&user_c, &user_b);
    assert_eq!(result, Err(Ok(ContractError::DelegationCycle)));
}

// ---------------------------------------------------------------------------
// balance_at snapshot — issue #52 (flash-loan protection)
// ---------------------------------------------------------------------------

/// balance_at returns the snapshot stored at the given ledger when one exists.
#[test]
fn test_balance_at_returns_snapshot() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);

    // Snapshot ledger: record the ledger at which we transfer tokens to user.
    let snapshot_ledger = env.ledger().sequence();
    token.transfer(&admin, &user, &10_000_000i128);

    // balance_at(snapshot_ledger) must return the user's balance at that ledger.
    let snap = token.balance_at(&user, &(snapshot_ledger as u64));
    assert_eq!(snap, 10_000_000, "snapshot should equal balance after transfer");
}

/// balance_at falls back to live balance when no snapshot exists for the ledger.
#[test]
fn test_balance_at_fallback_to_live_balance() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);

    // A ledger far in the past with no recorded snapshot.
    let past_ledger: u64 = 1;
    let live = token.balance(&admin);
    let result = token.balance_at(&admin, &past_ledger);
    // Falls back to live balance because no snapshot exists for ledger 1.
    assert_eq!(result, live);

    // Give user some tokens then check their fallback.
    token.transfer(&admin, &user, &5_000_000i128);
    let result2 = token.balance_at(&user, &past_ledger);
    assert_eq!(result2, 5_000_000, "fallback for user with no old snapshot = live balance");
}

/// Flash-loan simulation:
///   1. Attacker buys tokens (at ledger N).
///   2. Proposal snapshot was taken at ledger N-1 (before purchase).
///   3. Governance uses balance_at(snapshot_ledger) → vote weight = 0.
///   4. Attacker "repays" (burns/transfers back) at ledger N+1.
///
/// The snapshot at the proposal ledger reflects the pre-purchase state,
/// so the attacker cannot manipulate the vote tally.
#[test]
fn test_flash_loan_simulation_vote_weight_is_zero() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    let id = env.register(crate::TokenContract, ());
    let token = crate::TokenContractClient::new(&env, &id);
    token.initialize(
        &admin,
        &100_000_000i128,
        &String::from_slice(&env, "CosmosVote"),
        &String::from_slice(&env, "VOTE"),
        &7u32,
    );

    // Ledger 1: proposal created — snapshot taken here.
    // Attacker has 0 balance at this point.
    env.ledger().with_mut(|l| l.sequence_number = 1);
    let proposal_snapshot_ledger: u64 = 1;

    // Verify attacker has zero balance at proposal snapshot.
    assert_eq!(
        token.balance_at(&attacker, &proposal_snapshot_ledger),
        0,
        "attacker should have no balance at snapshot ledger"
    );

    // Ledger 2: attacker obtains tokens AFTER snapshot (flash loan / buy).
    env.ledger().with_mut(|l| l.sequence_number = 2);
    token.transfer(&admin, &attacker, &50_000_000i128);
    assert_eq!(token.balance(&attacker), 50_000_000, "attacker now holds tokens");

    // Governance queries balance_at(proposal_snapshot_ledger=1) for vote weight.
    let vote_weight = token.balance_at(&attacker, &proposal_snapshot_ledger);
    assert_eq!(
        vote_weight, 0,
        "vote weight at snapshot ledger must be 0 — flash-loan protection works"
    );

    // Ledger 3: attacker repays (transfers back) — mirroring flash-loan repayment.
    env.ledger().with_mut(|l| l.sequence_number = 3);
    token.transfer(&attacker, &admin, &50_000_000i128);
    assert_eq!(token.balance(&attacker), 0, "attacker repaid tokens");

    // Vote weight at proposal snapshot is still 0 even after repayment.
    let vote_weight_after = token.balance_at(&attacker, &proposal_snapshot_ledger);
    assert_eq!(
        vote_weight_after, 0,
        "vote weight must remain 0 after repayment — snapshot is immutable"
    );
}

/// Snapshot is recorded at EACH ledger where balance changes,
/// allowing governance to query any specific ledger.
#[test]
fn test_snapshot_recorded_at_multiple_ledgers() {
    let env = Env::default();
    let (token, admin, user) = setup(&env);

    // Ledger 10: first transfer
    env.ledger().with_mut(|l| l.sequence_number = 10);
    token.transfer(&admin, &user, &1_000_000i128);

    // Ledger 20: second transfer
    env.ledger().with_mut(|l| l.sequence_number = 20);
    token.transfer(&admin, &user, &2_000_000i128);

    // Snapshot at ledger 10 should reflect balance after first transfer.
    assert_eq!(token.balance_at(&user, &10), 1_000_000);
    // Snapshot at ledger 20 should reflect cumulative balance.
    assert_eq!(token.balance_at(&user, &20), 3_000_000);
    // Live balance also matches.
    assert_eq!(token.balance(&user), 3_000_000);
}
