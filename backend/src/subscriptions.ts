/**
 * Persistent subscription store backed by SQLite (via better-sqlite3).
 *
 * Subscriptions survive process restarts. The schema migration runs
 * automatically on startup — no manual step required.
 *
 * Configuration:
 *   DATABASE_URL  – path to the SQLite file (default: "./data/subscriptions.db")
 *                   Pass ":memory:" for an in-memory database (useful for tests).
 *
 * Usage:
 *   const store = new SubscriptionStore();
 *   store.add({ email: 'alice@example.com', webhookUrl: 'https://…' });
 *   store.findAll();     // SubscriptionRecord[]
 *   store.remove(id);
 *   store.close();       // call on process exit
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

export interface NewSubscription {
  email: string;
  webhookUrl: string;
}

export interface SubscriptionRecord extends NewSubscription {
  id: number;
  createdAt: number; // Unix timestamp (ms)
}

const DEFAULT_DB_PATH = './data/subscriptions.db';

export class SubscriptionStore {
  private readonly db: Database.Database;

  constructor(dbPath = process.env.DATABASE_URL ?? DEFAULT_DB_PATH) {
    // Create parent directories automatically (skip for :memory:)
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }

    this.db = new Database(dbPath);
    // Enable WAL for better concurrency
    this.db.pragma('journal_mode = WAL');
    this._migrate();
  }

  // ---------------------------------------------------------------------------
  // Automatic schema migration
  // ---------------------------------------------------------------------------

  private _migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        email       TEXT    NOT NULL,
        webhook_url TEXT    NOT NULL,
        created_at  INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_email
        ON subscriptions (email);
    `);
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  /**
   * Persist a new subscription.
   * Throws if a subscription with the same email already exists.
   */
  add(sub: NewSubscription): SubscriptionRecord {
    const now = Date.now();
    const result = this.db
      .prepare(
        'INSERT INTO subscriptions (email, webhook_url, created_at) VALUES (?, ?, ?)'
      )
      .run(sub.email, sub.webhookUrl, now);

    return {
      id: result.lastInsertRowid as number,
      email: sub.email,
      webhookUrl: sub.webhookUrl,
      createdAt: now,
    };
  }

  /** Retrieve all subscriptions. */
  findAll(): SubscriptionRecord[] {
    const rows = this.db
      .prepare('SELECT id, email, webhook_url, created_at FROM subscriptions ORDER BY id')
      .all() as Array<{ id: number; email: string; webhook_url: string; created_at: number }>;

    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      webhookUrl: r.webhook_url,
      createdAt: r.created_at,
    }));
  }

  /** Find a single subscription by ID. Returns undefined if not found. */
  findById(id: number): SubscriptionRecord | undefined {
    const row = this.db
      .prepare('SELECT id, email, webhook_url, created_at FROM subscriptions WHERE id = ?')
      .get(id) as { id: number; email: string; webhook_url: string; created_at: number } | undefined;

    if (!row) return undefined;
    return { id: row.id, email: row.email, webhookUrl: row.webhook_url, createdAt: row.created_at };
  }

  /**
   * Delete a subscription by ID.
   * Returns true if a row was deleted, false if the ID was not found.
   */
  remove(id: number): boolean {
    const result = this.db
      .prepare('DELETE FROM subscriptions WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }

  /** Close the underlying database connection (call on process exit). */
  close(): void {
    this.db.close();
  }
}
