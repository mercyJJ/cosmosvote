//! Token contract — storage accessors.

use soroban_sdk::{Address, Env, String};

#[soroban_sdk::contracttype]
#[derive(Clone)]
pub enum InstanceKey {
    Admin,
    PendingAdmin,
    TotalSupply,
    Initialized,
    Version,
    Name,
    Symbol,
    Decimals,
    Paused,
}

#[soroban_sdk::contracttype]
#[derive(Clone)]
pub enum PersistentKey {
    Balance(Address),
    /// Maps delegator → delegate (who holds their voting power).
    Delegation(Address),
    /// Maps a delegate → the addresses delegating voting power to them.
    Delegators(Address),
}

#[soroban_sdk::contracttype]
#[derive(Clone)]
pub enum TempKey {
    Allowance(Address, Address),
    /// Balance snapshot: (owner, ledger_sequence) → i128.
    /// Stored in Temporary storage so it expires naturally after the TTL window,
    /// matching the typical governance proposal lifecycle (~30 days).
    BalanceSnapshot(Address, u32),
}

#[soroban_sdk::contracttype]
#[derive(Clone, Debug)]
pub struct Allowance {
    pub amount: i128,
    pub expiry_ledger: u32,
}

pub struct TokenStorage;

impl TokenStorage {
    // Amount of ledgers to extend persistent entries by (30 days)
    pub const PERSISTENT_BUMP_AMOUNT: u32 = 518_400; // ~30 days @ 5s/ledger
    pub const PERSISTENT_THRESHOLD: u32 = 17_280;   // ~1 day @ 5s/ledger

    /// Snapshot TTL: ~30 days — must cover the full proposal voting window.
    pub const SNAPSHOT_TTL_LEDGERS: u32 = 518_400;
    /// Snapshot minimum lifetime before extension: ~1 day.
    pub const SNAPSHOT_TTL_THRESHOLD: u32 = 17_280;

    fn bump_persistent_ttl(env: &Env, key: &PersistentKey) {
        env.storage()
            .persistent()
            .extend_ttl(key, Self::PERSISTENT_THRESHOLD, Self::PERSISTENT_BUMP_AMOUNT);
    }

    pub fn is_initialized(env: &Env) -> bool {
        env.storage().instance().has(&InstanceKey::Initialized)
    }
    pub fn set_initialized(env: &Env) {
        env.storage().instance().set(&InstanceKey::Initialized, &true);
    }

    pub fn admin(env: &Env) -> Address {
        env.storage().instance().get(&InstanceKey::Admin).unwrap()
    }
    pub fn set_admin(env: &Env, v: &Address) {
        env.storage().instance().set(&InstanceKey::Admin, v);
    }

    pub fn pending_admin(env: &Env) -> Option<Address> {
        env.storage().instance().get(&InstanceKey::PendingAdmin)
    }
    pub fn set_pending_admin(env: &Env, v: Option<&Address>) {
        match v {
            Some(addr) => env.storage().instance().set(&InstanceKey::PendingAdmin, addr),
            None => env.storage().instance().remove(&InstanceKey::PendingAdmin),
        }
    }

    pub fn total_supply(env: &Env) -> i128 {
        env.storage().instance().get(&InstanceKey::TotalSupply).unwrap_or(0)
    }
    pub fn set_total_supply(env: &Env, v: i128) {
        env.storage().instance().set(&InstanceKey::TotalSupply, &v);
    }

    pub fn version(env: &Env) -> (u32, u32, u32) {
        env.storage().instance().get(&InstanceKey::Version).unwrap_or((1, 0, 0))
    }
    pub fn set_version(env: &Env, v: (u32, u32, u32)) {
        env.storage().instance().set(&InstanceKey::Version, &v);
    }

    pub fn name(env: &Env) -> String {
        env.storage()
            .instance()
            .get(&InstanceKey::Name)
            .unwrap_or(String::from_slice(env, ""))
    }
    pub fn set_name(env: &Env, v: &String) {
        env.storage().instance().set(&InstanceKey::Name, v);
    }

    pub fn symbol(env: &Env) -> String {
        env.storage()
            .instance()
            .get(&InstanceKey::Symbol)
            .unwrap_or(String::from_slice(env, ""))
    }
    pub fn set_symbol(env: &Env, v: &String) {
        env.storage().instance().set(&InstanceKey::Symbol, v);
    }

    pub fn decimals(env: &Env) -> u32 {
        env.storage().instance().get(&InstanceKey::Decimals).unwrap_or(0)
    }
    pub fn set_decimals(env: &Env, v: u32) {
        env.storage().instance().set(&InstanceKey::Decimals, &v);
    }

    pub fn paused(env: &Env) -> bool {
        env.storage().instance().get(&InstanceKey::Paused).unwrap_or(false)
    }
    pub fn set_paused(env: &Env, v: bool) {
        env.storage().instance().set(&InstanceKey::Paused, &v);
    }

    pub fn balance(env: &Env, owner: &Address) -> i128 {
        let key = PersistentKey::Balance(owner.clone());
        if let Some(v) = env.storage().persistent().get(&key) {
            // bump TTL on read
            Self::bump_persistent_ttl(env, &key);
            v
        } else {
            0
        }
    }
    pub fn set_balance(env: &Env, owner: &Address, v: i128) {
        let key = PersistentKey::Balance(owner.clone());
        env.storage().persistent().set(&key, &v);
        Self::bump_persistent_ttl(env, &key);

        // Automatically snapshot the new balance at the current ledger so that
        // balance_at(ledger) queries from governance can retrieve it later for
        // flash-loan protection (issue #52).
        let current_ledger = env.ledger().sequence();
        Self::set_balance_snapshot(env, owner, current_ledger, v);
    }

    // -----------------------------------------------------------------------
    // Balance snapshots (Temporary storage, issue #52)
    // -----------------------------------------------------------------------

    /// Write a balance snapshot for `owner` at `ledger` into Temporary storage.
    ///
    /// Snapshotting is performed automatically in `set_balance` whenever the
    /// balance changes; callers should not need to call this directly.
    ///
    /// The entry is stored in Temporary storage (cheapest tier) with a TTL of
    /// ~30 days, which is sufficient to cover the maximum governance proposal
    /// voting window.
    pub fn set_balance_snapshot(env: &Env, owner: &Address, ledger: u32, amount: i128) {
        let key = TempKey::BalanceSnapshot(owner.clone(), ledger);
        env.storage().temporary().set(&key, &amount);
        env.storage()
            .temporary()
            .extend_ttl(&key, Self::SNAPSHOT_TTL_THRESHOLD, Self::SNAPSHOT_TTL_LEDGERS);
    }

    pub fn allowance(env: &Env, owner: &Address, spender: &Address) -> i128 {
        Self::allowance_record(env, owner, spender)
            .map(|data| data.amount)
            .unwrap_or(0)
    }

    pub fn allowance_record(
        env: &Env,
        owner: &Address,
        spender: &Address,
    ) -> Option<Allowance> {
        let key = TempKey::Allowance(owner.clone(), spender.clone());
        if let Some(data) = env.storage().temporary().get::<TempKey, Allowance>(&key) {
            let current_ledger = env.ledger().sequence();
            if current_ledger > data.expiry_ledger || data.amount <= 0 {
                return None;
            }
            env.storage().temporary().set(&key, &data);
            Some(data)
        } else {
            None
        }
    }

    pub fn set_allowance(
        env: &Env,
        owner: &Address,
        spender: &Address,
        amount: i128,
        expiry_ledger: u32,
    ) {
        env.storage()
            .temporary()
            .set(
                &TempKey::Allowance(owner.clone(), spender.clone()),
                &Allowance {
                    amount,
                    expiry_ledger,
                },
            );
    }

    /// Returns the delegate address for `owner`, if any.
    pub fn delegation(env: &Env, owner: &Address) -> Option<Address> {
        env.storage()
            .persistent()
            .get(&PersistentKey::Delegation(owner.clone()))
    }
    pub fn set_delegation(env: &Env, owner: &Address, delegate: &Address) {
        env.storage()
            .persistent()
            .set(&PersistentKey::Delegation(owner.clone()), delegate);
    }
    pub fn remove_delegation(env: &Env, owner: &Address) {
        env.storage()
            .persistent()
            .remove(&PersistentKey::Delegation(owner.clone()));
    }

    pub fn delegators(env: &Env, delegate: &Address) -> soroban_sdk::Vec<Address> {
        let key = PersistentKey::Delegators(delegate.clone());
        if let Some(delegators) = env.storage().persistent().get(&key) {
            Self::bump_persistent_ttl(env, &key);
            delegators
        } else {
            soroban_sdk::Vec::new(env)
        }
    }

    pub fn add_delegator(env: &Env, delegate: &Address, owner: &Address) {
        let key = PersistentKey::Delegators(delegate.clone());
        let mut delegators = Self::delegators(env, delegate);
        if !delegators.contains(owner) {
            delegators.push_back(owner.clone());
        }
        env.storage().persistent().set(&key, &delegators);
        Self::bump_persistent_ttl(env, &key);
    }

    pub fn remove_delegator(env: &Env, delegate: &Address, owner: &Address) {
        let key = PersistentKey::Delegators(delegate.clone());
        let mut delegators = Self::delegators(env, delegate);
        let mut index = 0;
        while index < delegators.len() {
            if delegators.get(index) == Some(owner.clone()) {
                delegators.remove(index);
                break;
            }
            index += 1;
        }
        if delegators.is_empty() {
            env.storage().persistent().remove(&key);
        } else {
            env.storage().persistent().set(&key, &delegators);
            Self::bump_persistent_ttl(env, &key);
        }
    }

    /// Returns the total voting weight for `voter`: own balance + sum of all delegators' balances.
    /// NOTE: Soroban doesn't support reverse lookups, so delegators must be tracked off-chain.
    /// This function returns the voter's own balance; delegated weight is accumulated via
    /// `get_delegated_weight` which requires the caller to pass delegator addresses.
    pub fn get_delegated_weight(env: &Env, voter: &Address) -> i128 {
        // Base: voter's own balance (if they haven't delegated away)
        // Delegated weight is added by governance via cross-contract calls.
        // This returns the voter's own balance only; governance accumulates delegators.
        Self::balance(env, voter)
    }
}
