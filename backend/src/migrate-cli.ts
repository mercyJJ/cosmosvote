#!/usr/bin/env ts-node
/**
 * Migration CLI — issue #50
 *
 * Entry point for `npm run migrate:up` and `npm run migrate:down`.
 *
 * Usage:
 *   npm run migrate:up      — apply all pending migrations
 *   npm run migrate:down    — roll back the most recent migration
 *
 * The database path is read from the DB_PATH environment variable
 * (defaults to /data/cosmosvote.sqlite in production, or :memory: in test).
 */

import { openDb, migrateUp, migrateDown } from './migrate';

const DB_PATH = process.env.DB_PATH ?? '/data/cosmosvote.sqlite';
const [, , command = 'up'] = process.argv;

async function main(): Promise<void> {
  const db = openDb(DB_PATH);

  try {
    if (command === 'up') {
      const count = migrateUp(db);
      if (count === 0) {
        console.info('No pending migrations.');
      } else {
        console.info(`Applied ${count} migration(s) successfully.`);
      }
    } else if (command === 'down') {
      const rolled = migrateDown(db);
      if (rolled) {
        console.info(`Rolled back migration: ${rolled}`);
      } else {
        console.info('Nothing to roll back.');
      }
    } else {
      console.error(`Unknown command: ${command}. Use "up" or "down".`);
      process.exit(1);
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error('[migrate-cli] Fatal error:', err);
  process.exit(1);
});
