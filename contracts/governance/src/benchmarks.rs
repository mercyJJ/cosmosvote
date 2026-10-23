//! Governance contract — instruction count benchmarks.
//!
//! Issue #113: instruction counts are compared against the baseline stored
//! in `tests/baselines/perf_contract_execution.json` (versioned/committed)
//! instead of hardcoded constants, so a regression shows up as a diff in
//! that file during review as well as a CI failure. Run with
//! `BENCH_UPDATE=1` (or `make bench-update`) to intentionally refresh the
//! baseline after a deliberate, reviewed change in instruction cost.

#![cfg(test)]

use soroban_sdk::{testutils::{Address as _, Ledger}, Address, Env, String};
use cosmosvote_token::TokenContractClient;
use crate::{types::Vote, GovernanceContract, GovernanceContractClient};
use cosmosvote_token::TokenContract;
use std::fs;
use std::path::PathBuf;

// ---------------------------------------------------------------------------
// Baseline file handling
// ---------------------------------------------------------------------------

/// Path to the committed instruction-count baseline, resolved relative to
/// this crate's manifest dir so the test works regardless of cwd.
fn baseline_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/baselines/perf_contract_execution.json")
}

fn load_baselines() -> serde_json::Value {
    let path = baseline_path();
    let raw = fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("failed to read baseline file {}: {e}", path.display()));
    serde_json::from_str(&raw)
        .unwrap_or_else(|e| panic!("invalid JSON in baseline file {}: {e}", path.display()))
}

fn baseline_for(op: &str) -> u64 {
    let baselines = load_baselines();
    baselines[op]
        .as_u64()
        .unwrap_or_else(|| panic!("baseline file missing numeric field \"{op}\""))
}

/// When `BENCH_UPDATE=1` is set (via `make bench-update`), persist the
/// freshly measured instruction count as the new baseline for `op` instead
/// of asserting against the old one.
fn maybe_update_baseline(op: &str, instructions: u64) -> bool {
    if std::env::var("BENCH_UPDATE").ok().as_deref() != Some("1") {
        return false;
    }
    let path = baseline_path();
    let mut baselines = load_baselines();
    baselines[op] = serde_json::Value::from(instructions);
    fs::write(&path, serde_json::to_string_pretty(&baselines).unwrap() + "\n")
        .unwrap_or_else(|e| panic!("failed to write baseline file {}: {e}", path.display()));
    eprintln!("[bench-update] {op}: baseline updated to {instructions} instructions");
    true
}

/// Assert the measured instruction count is within 10% of the baseline for
/// `op`, unless BENCH_UPDATE=1 is set (in which case the baseline is
/// refreshed instead of asserted against).
fn check_against_baseline(op: &str, instructions: u64) {
    if maybe_update_baseline(op, instructions) {
        return;
    }
    let baseline = baseline_for(op);
    let limit = threshold(baseline);
    assert!(
        instructions <= limit,
        "{op} used {instructions} instructions, exceeds 10% over baseline {baseline} \
         (see tests/baselines/perf_contract_execution.json; run `make bench-update` if this \
         regression is intentional)",
    );
}

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------

fn setup_env() -> (Env, GovernanceContractClient<'static>, TokenContractClient<'static>, Address, Address) {
    let env = Env::default();
    let admin = Address::generate(&env);
    let proposer = Address::generate(&env);

    let token_id = env.register(TokenContract, ());
    let token = TokenContractClient::new(&env, &token_id);
    token.initialize(
        &admin, 
        &1_000_000_000_000i128, 
        &String::from_str(&env, "CosmosVote"), 
        &String::from_str(&env, "VOTE"), 
        &7u32
    );
    token.mint(&admin, &proposer, &10_000_000_000i128);

    let gov_id = env.register(GovernanceContract, ());
    let gov = GovernanceContractClient::new(&env, &gov_id);
    gov.initialize(&admin, &token_id, &0i128, &0u64, &0u32, &false, &None, &0u32);

    (env, gov, token, admin, proposer)
}

fn threshold(baseline: u64) -> u64 {
    baseline + (baseline / 10)
}

#[test]
fn bench_create_proposal() {
    let (env, gov, _token, _admin, proposer) = setup_env();

    env.as_contract(&gov.address, || {
        env.budget().reset_unlimited();
    });
    
    let instructions_before = env.budget().cpu_instruction_cost();
    gov.create_proposal(
        &proposer,
        &String::from_str(&env, "Vote Benchmark"),
        &String::from_str(&env, "Measuring instruction count for cast_vote"),
        &1_000_000i128,
        &604_800u64,
        &None,
        &None,
    );
    let instructions = env.budget().cpu_instruction_cost() - instructions_before;

    check_against_baseline("create_proposal", instructions);
}

#[test]
fn bench_cast_vote() {
    let (env, gov, token, admin, proposer) = setup_env();
    
    let id = gov.create_proposal(
        &proposer,
        &String::from_str(&env, "Vote Benchmark"),
        &String::from_str(&env, "Measuring instruction count for cast_vote"),
        &1_000_000i128,
        &604_800u64,
        &None,
        &None,
    );

    let voter = Address::generate(&env);
    token.mint(&admin, &voter, &1_000i128);

    env.as_contract(&gov.address, || {
        env.budget().reset_unlimited();
    });
    let instructions_before = env.budget().cpu_instruction_cost();
    gov.cast_vote(&voter, &id, &Vote::Yes);
    let instructions = env.budget().cpu_instruction_cost() - instructions_before;

    check_against_baseline("cast_vote", instructions);
}

#[test]
fn bench_finalise() {
    let (env, gov, token, admin, proposer) = setup_env();

    let id = gov.create_proposal(
        &proposer,
        &String::from_str(&env, "Finalise Benchmark"),
        &String::from_str(&env, "Measuring instruction count for finalise"),
        &1_000i128,
        &3600u64,
        &None,
        &None,
    );

    let voter = Address::generate(&env);
    token.mint(&admin, &voter, &1_000i128);
    gov.cast_vote(&voter, &id, &Vote::Yes);

    let end_time = gov.get_proposal(&id).end_time;
    env.ledger().with_mut(|l| l.timestamp = end_time + 1);

    env.as_contract(&gov.address, || {
        env.budget().reset_unlimited();
    });
    let instructions_before = env.budget().cpu_instruction_cost();
    gov.finalise(&id);
    let instructions = env.budget().cpu_instruction_cost() - instructions_before;

    check_against_baseline("finalise", instructions);
}
