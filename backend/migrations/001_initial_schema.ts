/**
 * Migration 001 — Initial schema
 *
 * Creates the foundational tables used by the CosmosVote backend:
 *
 *   subscriptions  — notification-service subscriber records
 *   events         — indexed governance contract events for replay / audit
 *   faucet_claims  — cooldown records for the testnet faucet
 *
 * This migration supersedes the inline `CREATE TABLE IF NOT EXISTS` statements
 * previously scattered across individual service files.
 */

import type { Migration } from '../src/migrate';

const migration: Migration = {
  id: 1,
  name: '001_initial_schema',

  up: `
    -- -----------------------------------------------------------------------
    -- Subscriptions table
    -- Each row is a subscriber who wants to be notified for one or more
    -- governance event types via one or more notification channels.
    -- -----------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS subscriptions (
      id              TEXT    PRIMARY KEY,         -- UUID
      proposal_id     TEXT    DEFAULT NULL,        -- NULL = all proposals
      events          TEXT    NOT NULL,            -- JSON array of GovernanceEventType
      email           TEXT    DEFAULT NULL,
      webhook_url     TEXT    DEFAULT NULL,
      slack_url       TEXT    DEFAULT NULL,
      discord_url     TEXT    DEFAULT NULL,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- -----------------------------------------------------------------------
    -- Events table
    -- Indexed governance contract events fetched from Horizon / Soroban RPC.
    -- Used for replay, audit, and idempotency checking.
    -- -----------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS events (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type      TEXT    NOT NULL,            -- GovernanceEventType
      proposal_id     TEXT    DEFAULT NULL,
      ledger          INTEGER NOT NULL,
      payload         TEXT    NOT NULL,            -- JSON blob of raw event data
      processed_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- -----------------------------------------------------------------------
    -- Faucet claims table
    -- Tracks per-wallet cooldown periods for the testnet token faucet.
    -- -----------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS faucet_claims (
      wallet_address  TEXT    PRIMARY KEY,
      claimed_at_ms   INTEGER NOT NULL
    );
  `,

  down: `
    DROP TABLE IF EXISTS faucet_claims;
    DROP TABLE IF EXISTS events;
    DROP TABLE IF EXISTS subscriptions;
  `,
};

export default migration;
