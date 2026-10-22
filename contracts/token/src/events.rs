//! Token contract — on-chain event emission.

use soroban_sdk::{symbol_short, Address, BytesN, Env};

pub struct TokenEvents;

impl TokenEvents {
    pub fn initialized(env: &Env, admin: &Address, supply: i128) {
        env.events().publish(
            (symbol_short!("token"), symbol_short!("init")),
            (admin.clone(), supply),
        );
    }

    pub fn transfer(env: &Env, from: &Address, to: &Address, amount: i128) {
        env.events().publish(
            (symbol_short!("token"), symbol_short!("xfer")),
            (from.clone(), to.clone(), amount),
        );
    }

    pub fn approval(env: &Env, owner: &Address, spender: &Address, amount: i128) {
        env.events().publish(
            (symbol_short!("token"), symbol_short!("approve")),
            (owner.clone(), spender.clone(), amount),
        );
    }

    pub fn minted(env: &Env, admin: &Address, to: &Address, amount: i128) {
        env.events().publish(
            (symbol_short!("token"), symbol_short!("mint")),
            (admin.clone(), to.clone(), amount),
        );
    }

    pub fn burned(env: &Env, admin: &Address, from: &Address, amount: i128) {
        env.events().publish(
            (symbol_short!("token"), symbol_short!("burn")),
            (admin.clone(), from.clone(), amount),
        );
    }

    pub fn admin_transferred(env: &Env, old: &Address, new: &Address) {
        env.events().publish(
            (symbol_short!("token"), symbol_short!("admin")),
            (old.clone(), new.clone()),
        );
    }

    pub fn admin_transfer_proposed(env: &Env, current: &Address, pending: &Address) {
        env.events().publish(
            (symbol_short!("token"), symbol_short!("propose")),
            (current.clone(), pending.clone()),
        );
    }

    pub fn admin_transfer_accepted(env: &Env, previous: &Address, new: &Address) {
        env.events().publish(
            (symbol_short!("token"), symbol_short!("accept")),
            (previous.clone(), new.clone()),
        );
    }

    pub fn delegated(env: &Env, owner: &Address, delegate: &Address) {
        env.events().publish(
            (symbol_short!("token"), symbol_short!("delegate")),
            (owner.clone(), delegate.clone()),
        );
    }

    pub fn undelegated(env: &Env, owner: &Address) {
        env.events().publish(
            (symbol_short!("token"), symbol_short!("undelegt")),
            owner.clone(),
        );
    }

    pub fn unpaused(env: &Env, admin: &Address) {
        env.events().publish(
            (symbol_short!("token"), symbol_short!("unpause")),
            admin.clone(),
        );
    }

    pub fn paused(env: &Env, admin: &Address) {
        env.events().publish(
            (symbol_short!("token"), symbol_short!("paused")),
            admin.clone(),
        );
    }

    pub fn upgraded(env: &Env, new_wasm_hash: &BytesN<32>) {
        env.events().publish(
            (symbol_short!("token"), symbol_short!("upgraded")),
            new_wasm_hash.clone(),
        );
    }
}
