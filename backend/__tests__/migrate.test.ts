/**
 * Tests for the database migration runner — issue #50
 *
 * All tests use an in-memory SQLite database so they run fast and leave
 * no files on disk.
 */

import Database from 'better-sqlite3';
import {
  ensureMigrationsTable,
  migrateUp,
  migrateDown,
  runMigrationsOnStartup,
  openDb,
  type Migration,
} from '../src/migrate';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inMemoryDb(): Database.Database {
  return openDb(':memory:');
}

const MIGRATION_A: Migration = {
  id: 1,
  name: '001_create_users',
  up: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)',
  down: 'DROP TABLE users',
};

const MIGRATION_B: Migration = {
  id: 2,
  name: '002_add_email',
  up: 'ALTER TABLE users ADD COLUMN email TEXT',
  down: "CREATE TABLE users_backup AS SELECT id, name FROM users; DROP TABLE users; ALTER TABLE users_backup RENAME TO users",
};

function tableExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { name: string } | undefined;
  return row !== undefined;
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const info = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  return info.some((c) => c.name === column);
}

// ---------------------------------------------------------------------------
// ensureMigrationsTable
// ---------------------------------------------------------------------------

describe('ensureMigrationsTable', () => {
  it('creates _migrations table on first call', () => {
    const db = inMemoryDb();
    ensureMigrationsTable(db);
    expect(tableExists(db, '_migrations')).toBe(true);
  });

  it('is idempotent — calling twice does not throw', () => {
    const db = inMemoryDb();
    expect(() => {
      ensureMigrationsTable(db);
      ensureMigrationsTable(db);
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// migrateUp
// ---------------------------------------------------------------------------

describe('migrateUp', () => {
  it('applies a single migration', () => {
    const db = inMemoryDb();
    const count = migrateUp(db, [MIGRATION_A]);
    expect(count).toBe(1);
    expect(tableExists(db, 'users')).toBe(true);
  });

  it('applies multiple migrations in order', () => {
    const db = inMemoryDb();
    const count = migrateUp(db, [MIGRATION_A, MIGRATION_B]);
    expect(count).toBe(2);
    expect(tableExists(db, 'users')).toBe(true);
    expect(columnExists(db, 'users', 'email')).toBe(true);
  });

  it('records applied migrations in _migrations table', () => {
    const db = inMemoryDb();
    migrateUp(db, [MIGRATION_A]);
    const rows = db.prepare('SELECT name FROM _migrations').all() as Array<{ name: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('001_create_users');
  });

  it('returns 0 when all migrations are already applied', () => {
    const db = inMemoryDb();
    migrateUp(db, [MIGRATION_A]);
    const second = migrateUp(db, [MIGRATION_A]);
    expect(second).toBe(0);
  });

  it('only applies pending migrations (skips already-applied ones)', () => {
    const db = inMemoryDb();
    migrateUp(db, [MIGRATION_A]);
    const second = migrateUp(db, [MIGRATION_A, MIGRATION_B]);
    expect(second).toBe(1); // only MIGRATION_B is new
    expect(columnExists(db, 'users', 'email')).toBe(true);
  });

  it('applies migrations out-of-definition-order by sorting on id', () => {
    const db = inMemoryDb();
    // Deliberately pass in reversed order — runner must sort by id
    const count = migrateUp(db, [MIGRATION_B, MIGRATION_A]);
    expect(count).toBe(2);
    // users table created first (A), then email column added (B)
    expect(columnExists(db, 'users', 'email')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// migrateDown
// ---------------------------------------------------------------------------

describe('migrateDown', () => {
  it('rolls back the most recently applied migration', () => {
    const db = inMemoryDb();
    migrateUp(db, [MIGRATION_A]);
    const rolled = migrateDown(db, [MIGRATION_A]);
    expect(rolled).toBe('001_create_users');
    expect(tableExists(db, 'users')).toBe(false);
  });

  it('removes the rolled-back migration from _migrations', () => {
    const db = inMemoryDb();
    migrateUp(db, [MIGRATION_A]);
    migrateDown(db, [MIGRATION_A]);
    const rows = db.prepare('SELECT name FROM _migrations').all();
    expect(rows).toHaveLength(0);
  });

  it('returns null when there are no migrations to roll back', () => {
    const db = inMemoryDb();
    const result = migrateDown(db, [MIGRATION_A]);
    expect(result).toBeNull();
  });

  it('rolls back the last of two applied migrations', () => {
    const db = inMemoryDb();
    migrateUp(db, [MIGRATION_A, MIGRATION_B]);
    const rolled = migrateDown(db, [MIGRATION_A, MIGRATION_B]);
    expect(rolled).toBe('002_add_email');
    // users table still exists (only B was rolled back)
    expect(tableExists(db, 'users')).toBe(true);
  });

  it('throws when the last migration name is not in the provided list', () => {
    const db = inMemoryDb();
    migrateUp(db, [MIGRATION_A]);
    expect(() => migrateDown(db, [])).toThrow('Cannot roll back unknown migration');
  });
});

// ---------------------------------------------------------------------------
// runMigrationsOnStartup
// ---------------------------------------------------------------------------

describe('runMigrationsOnStartup', () => {
  it('applies pending migrations on startup', () => {
    const db = inMemoryDb();
    // Monkey-patch ALL_MIGRATIONS via the module to test with real migration
    // by running against the actual initial schema migration.
    const { ALL_MIGRATIONS } = require('../src/migrate');
    runMigrationsOnStartup(db);
    // The real migration should have created the subscriptions table.
    expect(tableExists(db, 'subscriptions')).toBe(true);
    expect(tableExists(db, 'events')).toBe(true);
    expect(tableExists(db, 'faucet_claims')).toBe(true);
  });

  it('is idempotent — calling twice does not throw', () => {
    const db = inMemoryDb();
    expect(() => {
      runMigrationsOnStartup(db);
      runMigrationsOnStartup(db);
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Initial schema migration (001_initial_schema)
// ---------------------------------------------------------------------------

describe('initial schema migration (001)', () => {
  it('creates all three tables', () => {
    const db = inMemoryDb();
    const { ALL_MIGRATIONS } = require('../src/migrate');
    migrateUp(db, ALL_MIGRATIONS);
    expect(tableExists(db, 'subscriptions')).toBe(true);
    expect(tableExists(db, 'events')).toBe(true);
    expect(tableExists(db, 'faucet_claims')).toBe(true);
  });

  it('down migration drops all three tables', () => {
    const db = inMemoryDb();
    const { ALL_MIGRATIONS } = require('../src/migrate');
    migrateUp(db, ALL_MIGRATIONS);
    migrateDown(db, ALL_MIGRATIONS);
    expect(tableExists(db, 'subscriptions')).toBe(false);
    expect(tableExists(db, 'events')).toBe(false);
    expect(tableExists(db, 'faucet_claims')).toBe(false);
  });

  it('schema allows inserting a subscription row', () => {
    const db = inMemoryDb();
    const { ALL_MIGRATIONS } = require('../src/migrate');
    migrateUp(db, ALL_MIGRATIONS);
    expect(() => {
      db.prepare(
        "INSERT INTO subscriptions (id, events) VALUES ('sub-1', '[\"created\"]')"
      ).run();
    }).not.toThrow();
  });

  it('schema allows inserting an event row', () => {
    const db = inMemoryDb();
    const { ALL_MIGRATIONS } = require('../src/migrate');
    migrateUp(db, ALL_MIGRATIONS);
    expect(() => {
      db.prepare(
        "INSERT INTO events (event_type, ledger, payload) VALUES ('created', 100, '{}')"
      ).run();
    }).not.toThrow();
  });
});
