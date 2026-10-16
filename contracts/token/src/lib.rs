//! CosmosVote Token Contract
//!
//! SEP-41-compatible governance token with balances, transfers,
//! mint/burn, spending allowances, and admin controls.

#![no_std]

mod events;
mod storage;
mod types;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, String, Vec};

use events::TokenEvents;
use storage::TokenStorage;
use types::ContractError;

#[contract]
pub struct TokenContract;

#[contractimpl]
impl TokenContract {
    // -----------------------------------------------------------------------
    // Initialization
    // -----------------------------------------------------------------------

    /// Initialize the token contract (SEP-41 compatible).
    ///
    /// * `admin`          – receives initial supply and admin privileges
    /// * `initial_supply` – total tokens minted to admin
    /// * `name`           – human-readable name (e.g., "CosmosVote Token")
    /// * `symbol`         – ticker symbol (e.g., "VOTE")
    /// * `decimals`       – number of decimal places (e.g., 7 for Stellar)
    pub fn initialize(
        env: Env,
        admin: Address,
        initial_supply: i128,
        name: String,
        symbol: String,
        decimals: u32,
    ) -> Result<(), ContractError> {
        if TokenStorage::is_initialized(&env) {
            return Err(ContractError::AlreadyInitialized);
        }

        TokenStorage::set_admin(&env, &admin);
        TokenStorage::set_total_supply(&env, initial_supply);
        TokenStorage::set_balance(&env, &admin, initial_supply);
        TokenStorage::set_name(&env, &name);
        TokenStorage::set_symbol(&env, &symbol);
        TokenStorage::set_decimals(&env, decimals);
        TokenStorage::set_initialized(&env);
        TokenStorage::set_version(&env, (1, 0, 0));

        TokenEvents::initialized(&env, &admin, initial_supply);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------

    pub fn total_supply(env: Env) -> i128 {
        TokenStorage::total_supply(&env)
    }

    pub fn balance(env: Env, owner: Address) -> i128 {
        TokenStorage::balance(&env, &owner)
    }

    /// Alias for balance (SEP-41 compatibility).
    pub fn balance_of(env: Env, owner: Address) -> i128 {
        TokenStorage::balance(&env, &owner)
    }

    pub fn balance_at(env: Env, owner: Address, ledger: u64) -> i128 {
        // Try to read the snapshot stored at the given ledger sequence.
        // Snapshots are written by set_balance on every transfer/mint/burn,
        // so if the owner's balance changed at or before `ledger` we will have
        // a stored entry.  If no snapshot exists (e.g., the TTL has expired or
        // the account was never touched at that ledger), fall back to the live
        // balance as a safe default — this preserves backward compatibility
        // while the snapshot infrastructure is being populated.
        if let Some(snap) = TokenStorage::balance_snapshot(&env, &owner, ledger as u32) {
            snap
        } else {
            TokenStorage::balance(&env, &owner)
        }
    }

    pub fn allowance(env: Env, owner: Address, spender: Address) -> i128 {
        TokenStorage::allowance(&env, &owner, &spender)
    }

    pub fn admin(env: Env) -> Address {
        TokenStorage::admin(&env)
    }

    pub fn version(env: Env) -> (u32, u32, u32) {
        TokenStorage::version(&env)
    }

    pub fn is_paused(env: Env) -> bool {
        TokenStorage::paused(&env)
    }

    /// Return the token name (SEP-41).
    pub fn name(env: Env) -> String {
        TokenStorage::name(&env)
    }

    /// Return the token symbol (SEP-41).
    pub fn symbol(env: Env) -> String {
        TokenStorage::symbol(&env)
    }

    /// Return the number of decimal places (SEP-41).
    pub fn decimals(env: Env) -> u32 {
        TokenStorage::decimals(&env)
    }

    // -----------------------------------------------------------------------
    // Transfers
    // -----------------------------------------------------------------------

    /// Transfer tokens from `from` to `to`.
    pub fn transfer(
        env: Env,
        from: Address,
        to: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        from.require_auth();
        Self::assert_not_paused(&env)?;
        Self::validate_amount(amount)?;

        let from_bal = TokenStorage::balance(&env, &from);
        if from_bal < amount {
            return Err(ContractError::InsufficientBalance);
        }

        if from == to {
            return Ok(());
        }

        TokenStorage::set_balance(&env, &from, from_bal - amount);
        let to_bal = TokenStorage::balance(&env, &to);
        TokenStorage::set_balance(&env, &to, to_bal + amount);

        TokenEvents::transfer(&env, &from, &to, amount);
        Ok(())
    }

    /// Transfer tokens on behalf of `from` using a pre-approved allowance.
    pub fn transfer_from(
        env: Env,
        spender: Address,
        from: Address,
        to: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        spender.require_auth();
        Self::assert_not_paused(&env)?;
        Self::validate_amount(amount)?;

        let allowance_record = TokenStorage::allowance_record(&env, &from, &spender)
            .ok_or(ContractError::AllowanceExceeded)?;
        if allowance_record.amount < amount {
            return Err(ContractError::AllowanceExceeded);
        }

        let from_bal = TokenStorage::balance(&env, &from);
        if from_bal < amount {
            return Err(ContractError::InsufficientBalance);
        }

        let remaining = allowance_record.amount - amount;
        TokenStorage::set_allowance(
            &env,
            &from,
            &spender,
            remaining,
            allowance_record.expiry_ledger,
        );
        TokenStorage::set_balance(&env, &from, from_bal - amount);
        let to_bal = TokenStorage::balance(&env, &to);
        TokenStorage::set_balance(&env, &to, to_bal + amount);

        TokenEvents::transfer(&env, &from, &to, amount);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Allowances
    // -----------------------------------------------------------------------

    /// Approve `spender` to transfer up to `amount` tokens from `owner`.
    pub fn approve(
        env: Env,
        owner: Address,
        spender: Address,
        amount: i128,
        expiry_ledger: u32,
    ) -> Result<(), ContractError> {
        owner.require_auth();
        if amount < 0 {
            return Err(ContractError::InvalidAmount);
        }
        let current_ledger = env.ledger().sequence();
        if expiry_ledger <= current_ledger {
            return Err(ContractError::InvalidExpiry);
        }
        TokenStorage::set_allowance(&env, &owner, &spender, amount, expiry_ledger);
        TokenEvents::approval(&env, &owner, &spender, amount);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Mint & burn (admin only)
    // -----------------------------------------------------------------------

    /// Mint new tokens to `to`. Admin only.
    pub fn mint(
        env: Env,
        admin: Address,
        to: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        admin.require_auth();
        Self::assert_admin(&env, &admin)?;
        Self::assert_not_paused(&env)?;
        Self::validate_amount(amount)?;

        let supply = TokenStorage::total_supply(&env);
        TokenStorage::set_total_supply(&env, supply + amount);
        let bal = TokenStorage::balance(&env, &to);
        TokenStorage::set_balance(&env, &to, bal + amount);

        TokenEvents::minted(&env, &admin, &to, amount);
        Ok(())
    }

    /// Burn tokens from `from`. Admin only.
    pub fn burn(
        env: Env,
        admin: Address,
        from: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        admin.require_auth();
        Self::assert_admin(&env, &admin)?;
        Self::assert_not_paused(&env)?;
        Self::validate_amount(amount)?;

        let bal = TokenStorage::balance(&env, &from);
        if bal < amount {
            return Err(ContractError::InsufficientBalance);
        }

        let supply = TokenStorage::total_supply(&env);
        TokenStorage::set_total_supply(&env, supply - amount);
        TokenStorage::set_balance(&env, &from, bal - amount);

        TokenEvents::burned(&env, &admin, &from, amount);
        Ok(())
    }

    /// Burn your own tokens. Owner only.
    pub fn burn_self(
        env: Env,
        owner: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        owner.require_auth();
        Self::validate_amount(amount)?;

        let bal = TokenStorage::balance(&env, &owner);
        if bal < amount {
            return Err(ContractError::InsufficientBalance);
        }

        let supply = TokenStorage::total_supply(&env);
        TokenStorage::set_total_supply(&env, supply - amount);
        TokenStorage::set_balance(&env, &owner, bal - amount);

        TokenEvents::burned(&env, &owner, &owner, amount);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Delegation
    // -----------------------------------------------------------------------

    /// Delegate voting power from `owner` to `delegate_to`.
    ///
    /// The owner's token balance is retained; only voting weight is delegated.
    /// An owner can only delegate to one address at a time.
    ///
    /// # Cycle detection
    /// Direct cycles (A→B when B already delegates to A) are rejected with
    /// `DelegationCycle`. Multi-hop delegation (A→B→C) is **not supported** —
    /// `get_delegated_weight` accepts an explicit delegators list and weight
    /// is only accumulated one level deep. Callers must not pass cyclic
    /// delegator lists to `get_delegated_weight`.
    pub fn delegate(
        env: Env,
        owner: Address,
        delegate_to: Address,
    ) -> Result<(), ContractError> {
        owner.require_auth();

        // Guard: cannot delegate to self
        if owner == delegate_to {
            return Err(ContractError::CannotDelegateSelf);
        }

        // Guard: already delegating to someone
        if TokenStorage::delegation(&env, &owner).is_some() {
            return Err(ContractError::AlreadyDelegating);
        }

        // Guard: direct cycle — if delegate_to already delegates back to owner,
        // setting owner→delegate_to would create A→B, B→A.
        if let Some(existing) = TokenStorage::delegation(&env, &delegate_to) {
            if existing == owner {
                return Err(ContractError::DelegationCycle);
            }
        }

        TokenStorage::set_delegation(&env, &owner, &delegate_to);
        TokenEvents::delegated(&env, &owner, &delegate_to);
        Ok(())
    }

    /// Remove the delegation from `owner`, reclaiming their own voting power.
    pub fn undelegate(env: Env, owner: Address) -> Result<(), ContractError> {
        owner.require_auth();
        if TokenStorage::delegation(&env, &owner).is_none() {
            return Err(ContractError::NotDelegating);
        }
        TokenStorage::remove_delegation(&env, &owner);
        TokenEvents::undelegated(&env, &owner);
        Ok(())
    }

    /// Returns the current delegate for `owner`, or `None`.
    pub fn get_delegation(env: Env, owner: Address) -> Option<Address> {
        TokenStorage::delegation(&env, &owner)
    }

    /// Returns the voting weight for `voter`: their own balance plus the balances
    /// of all `delegators` who have delegated to them.
    ///
    /// Governance calls this with the list of delegators it tracks off-chain.
    /// For on-chain use, governance accumulates delegated weight by checking each
    /// potential delegator's stored delegation target.
    pub fn get_delegated_weight(env: Env, voter: Address, delegators: soroban_sdk::Vec<Address>) -> i128 {
        let mut weight = TokenStorage::balance(&env, &voter);
        for delegator in delegators.iter() {
            if let Some(delegate) = TokenStorage::delegation(&env, &delegator) {
                if delegate == voter {
                    weight = weight.saturating_add(TokenStorage::balance(&env, &delegator));
                }
            }
        }
        weight
    }

    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    /// Initiate a two-step admin transfer. Current admin only.
    pub fn propose_admin(
        env: Env,
        admin: Address,
        new_admin: Address,
    ) -> Result<(), ContractError> {
        admin.require_auth();
        Self::assert_admin(&env, &admin)?;

        TokenStorage::set_pending_admin(&env, Some(&new_admin));
        TokenEvents::admin_transfer_proposed(&env, &admin, &new_admin);
        Ok(())
    }

    /// Accept admin privileges. Called by the pending admin.
    pub fn accept_admin(env: Env, pending_admin: Address) -> Result<(), ContractError> {
        pending_admin.require_auth();

        let current_pending = TokenStorage::pending_admin(&env)
            .ok_or(ContractError::NoPendingAdmin)?;

        if pending_admin != current_pending {
            return Err(ContractError::NotPendingAdmin);
        }

        let previous_admin = TokenStorage::admin(&env);
        TokenStorage::set_admin(&env, &pending_admin);
        TokenStorage::set_pending_admin(&env, None);
        TokenEvents::admin_transfer_accepted(&env, &previous_admin, &pending_admin);
        Ok(())
    }

    /// Pause all token operations. Admin only.
    pub fn pause(env: Env, admin: Address) -> Result<(), ContractError> {
        admin.require_auth();
        Self::assert_admin(&env, &admin)?;

        if TokenStorage::paused(&env) {
            return Err(ContractError::ContractPaused);
        }

        TokenStorage::set_paused(&env, true);
        TokenEvents::paused(&env, &admin);
        Ok(())
    }

    /// Unpause the token contract. Admin only.
    pub fn unpause(env: Env, admin: Address) -> Result<(), ContractError> {
        admin.require_auth();
        Self::assert_admin(&env, &admin)?;

        if !TokenStorage::paused(&env) {
            return Err(ContractError::NotPaused);
        }

        TokenStorage::set_paused(&env, false);
        TokenEvents::unpaused(&env, &admin);
        Ok(())
    }

    /// Upgrade the token contract code. Admin only.
    pub fn upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>) -> Result<(), ContractError> {
        admin.require_auth();
        Self::assert_admin(&env, &admin)?;

        env.deployer().update_current_contract_wasm(new_wasm_hash.clone());
        TokenEvents::upgraded(&env, &new_wasm_hash);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    fn validate_amount(amount: i128) -> Result<(), ContractError> {
        if amount <= 0 {
            Err(ContractError::InvalidAmount)
        } else {
            Ok(())
        }
    }

    fn assert_admin(env: &Env, caller: &Address) -> Result<(), ContractError> {
        if TokenStorage::admin(env) != *caller {
            Err(ContractError::NotAdmin)
        } else {
            Ok(())
        }
    }

    fn assert_not_paused(env: &Env) -> Result<(), ContractError> {
        if TokenStorage::paused(env) {
            Err(ContractError::ContractPaused)
        } else {
            Ok(())
        }
    }
}
