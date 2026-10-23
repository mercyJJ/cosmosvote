/**
 * API key store for the notification service — Issue #119.
 *
 * Provides key revocation, rotation, and staleness tracking for the
 * admin/viewer API keys used by `auth.ts`. Keys are persisted as salted
 * SHA-256 hashes (never plaintext) in a JSON file so that a leaked data
 * file does not itself leak usable credentials.
 *
 * File layout (`API_KEY_STORE_PATH`, default `data/api-keys.json`):
 * {
 *   "keys": [
 *     { "id": "...", "role": "admin", "hash": "...", "createdAt": "ISO", "revokedAt": null }
 *   ]
 * }
 */

import { randomBytes, createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export type KeyRole = 'admin' | 'viewer';

export interface ApiKeyRecord {
  id: string;
  role: KeyRole;
  hash: string;
  createdAt: string;
  revokedAt: string | null;
}

interface KeyStoreFile {
  keys: ApiKeyRecord[];
}

const DEFAULT_STORE_PATH = path.join(__dirname, '..', 'data', 'api-keys.json');

function storePath(): string {
  return process.env.API_KEY_STORE_PATH ?? DEFAULT_STORE_PATH;
}

function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

function readStore(): KeyStoreFile {
  const p = storePath();
  if (!fs.existsSync(p)) {
    return { keys: [] };
  }
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.keys)) return { keys: [] };
    return parsed;
  } catch {
    return { keys: [] };
  }
}

function writeStore(store: KeyStoreFile): void {
  const p = storePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(store, null, 2) + '\n', { mode: 0o600 });
}

/** Generate a new random API key (hex-encoded, 256 bits of entropy). */
export function generateRawKey(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Resolve the role for a raw key value by checking it against the key
 * store. Revoked keys never resolve to a role, regardless of hash match.
 */
export function resolveRoleFromStore(rawKey: string): KeyRole | 'none' {
  if (!rawKey) return 'none';
  const hash = hashKey(rawKey);
  const store = readStore();
  const match = store.keys.find((k) => k.hash === hash);
  if (!match || match.revokedAt !== null) return 'none';
  return match.role;
}

/** Add a brand-new active key for the given role. Returns the raw key (only time it's visible). */
export function addKey(role: KeyRole): { id: string; rawKey: string } {
  const store = readStore();
  const rawKey = generateRawKey();
  const id = randomBytes(8).toString('hex');
  store.keys.push({
    id,
    role,
    hash: hashKey(rawKey),
    createdAt: new Date().toISOString(),
    revokedAt: null,
  });
  writeStore(store);
  return { id, rawKey };
}

/** Mark a key as revoked. Revoked keys are rejected with 401 immediately. */
export function revokeKey(id: string): boolean {
  const store = readStore();
  const rec = store.keys.find((k) => k.id === id);
  if (!rec || rec.revokedAt !== null) return false;
  rec.revokedAt = new Date().toISOString();
  writeStore(store);
  return true;
}

/**
 * Rotate the active key for a role: generate a new key, then revoke the
 * previously active key(s) for that role. Returns the new raw key.
 */
export function rotateKey(role: KeyRole): { id: string; rawKey: string; revokedIds: string[] } {
  const store = readStore();
  const revokedIds: string[] = [];
  for (const rec of store.keys) {
    if (rec.role === role && rec.revokedAt === null) {
      rec.revokedAt = new Date().toISOString();
      revokedIds.push(rec.id);
    }
  }
  writeStore(store);
  const created = addKey(role);
  return { ...created, revokedIds };
}

/** List all keys (hashes only — never the raw key) for auditing/alerting. */
export function listKeys(): ApiKeyRecord[] {
  return readStore().keys;
}

/**
 * Return active keys that have not been rotated in more than `maxAgeDays`
 * days. Used to power the stale-key alert.
 */
export function findStaleKeys(maxAgeDays = 90): ApiKeyRecord[] {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  return readStore().keys.filter(
    (k) => k.revokedAt === null && new Date(k.createdAt).getTime() < cutoff,
  );
}
