/**
 * Database migration runner — issue #50
 *
 * Provides up/down migration support for the CosmosVote backend SQLite database
 * using the `better-sqlite3` driver (already a project dependency).
 *
 * ## Design
 *
 * - Migrations live in `backend/migrations/` as TypeScript modules that export
 *   a default `Migration` object.
 * - Applied migrations are tracked in a `_migrations` table (created automatically).
 * - `migrateUp()` runs all pending migrations in ascending ID order.
 * - `migrateDown()` rolls back the most recently applied migration.
 * - All migration SQL is executed inside an explicit transaction so a failed
 *   migration leaves the database in a clean state.
 *
 * ## Usage
 *
 *   import { openDb, migrateUp, migrateDown } from './migrate';
 *
 *   const db = openDb(databasePath);
 *   migrateUp(db);  // apply all pending migrations
 *
 * CLI usage (npm scripts):
 *
 *   npm run migrate:up      — apply pending migrations
 *   npm run migrate:down    — roll back the last migration
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single reversible migration. */
export interface Migration {
  /** Unique monotonic integer identifier (used for ordering). */
  id: number;
  /** Human-readable name, also used as the key in _migrations. */
  name: string;
  /** SQL statements to apply (semicolon-separated). */
  up: string;
  /** SQL statements to roll back (semicolon-separated). */
  down: string;
}

/** Row shape in the _migrations tracking table. */
interface MigrationRecord {
  id: number;
  name: string;
  applied_at: number;
}

// ---------------------------------------------------------------------------
// Migration registry
// ---------------------------------------------------------------------------

// Import all migration modules here in ascending order.
// New migrations should be appended to this list.
import migration001 from '../migrations/001_initial_schema';

/** Ordered list of all known migrations. */
export const ALL_MIGRATIONS: Migration[] = [
  migration001,
];

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

/**
 * Open (or create) the SQLite database at `path`.
 *
 * Enables WAL mode for better concurrent read performance and sets a
 * foreign-key pragma.
 */
export function openDb(path: string): Database.Database {
  if (path !== ':memory:') {
    mkdirSync(dirname(resolve(path)), { recursive: true });
  }
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * Ensure the `_migrations` tracking table exists.
 * Called automatically by `migrateUp` and `migrateDown`.
 */
export function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          INTEGER PRIMARY KEY,
      name        TEXT    NOT NULL UNIQUE,
      applied_at  INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
}

/** Return the set of migration names that have already been applied. */
function appliedMigrations(db: Database.Database): Set<string> {
  const rows = db
    .prepare('SELECT name FROM _migrations ORDER BY id ASC')
    .all() as Array<{ name: string }>;
  return new Set(rows.map((r) => r.name));
}

/** Return the most-recently applied migration record, or null. */
function lastApplied(db: Database.Database): MigrationRecord | null {
  const row = db
    .prepare('SELECT id, name, applied_at FROM _migrations ORDER BY id DESC LIMIT 1')
    .get() as MigrationRecord | undefined;
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Core migration operations
// ---------------------------------------------------------------------------

/**
 * Apply all pending migrations in ascending order.
 *
 * Returns the number of migrations that were applied.
 * If the database is already up-to-date, returns 0.
 */
export function migrateUp(
  db: Database.Database,
  migrations: Migration[] = ALL_MIGRATIONS,
): number {
  ensureMigrationsTable(db);
  const applied = appliedMigrations(db);
  const pending = migrations
    .filter((m) => !applied.has(m.name))
    .sort((a, b) => a.id - b.id);

  if (pending.length === 0) {
    console.info('[migrate] Database is already up to date.');
    return 0;
  }

  let count = 0;
  for (const migration of pending) {
    console.info(`[migrate] Applying migration: ${migration.name}`);
    db.transaction(() => {
      db.exec(migration.up);
      db.prepare(
        'INSERT INTO _migrations (id, name) VALUES (?, ?)',
      ).run(migration.id, migration.name);
    })();
    count += 1;
    console.info(`[migrate] Applied: ${migration.name}`);
  }

  console.info(`[migrate] ${count} migration(s) applied.`);
  return count;
}

/**
 * Roll back the most recently applied migration.
 *
 * Returns the name of the migration that was rolled back, or null if
 * the database is already at the baseline (no migrations applied).
 */
export function migrateDown(
  db: Database.Database,
  migrations: Migration[] = ALL_MIGRATIONS,
): string | null {
  ensureMigrationsTable(db);
  const last = lastApplied(db);
  if (!last) {
    console.info('[migrate] Nothing to roll back — no migrations have been applied.');
    return null;
  }

  const migration = migrations.find((m) => m.name === last.name);
  if (!migration) {
    throw new Error(
      `[migrate] Cannot roll back unknown migration "${last.name}". ` +
      'Is it missing from ALL_MIGRATIONS?',
    );
  }

  console.info(`[migrate] Rolling back migration: ${migration.name}`);
  db.transaction(() => {
    db.exec(migration.down);
    db.prepare('DELETE FROM _migrations WHERE name = ?').run(migration.name);
  })();
  console.info(`[migrate] Rolled back: ${migration.name}`);
  return migration.name;
}

// ---------------------------------------------------------------------------
// Auto-run on startup (production)
// ---------------------------------------------------------------------------

/**
 * Run `migrateUp` automatically when called from the application startup path.
 *
 * This is the recommended integration point for production deployments.
 * Import and call `runMigrationsOnStartup(db)` from your server entry point.
 */
export function runMigrationsOnStartup(db: Database.Database): void {
  ensureMigrationsTable(db);
  const applied = migrateUp(db);
  if (applied === 0) {
    console.info('[migrate] Startup check: database schema is current.');
  } else {
    console.info(`[migrate] Startup: applied ${applied} migration(s).`);
  }
}
