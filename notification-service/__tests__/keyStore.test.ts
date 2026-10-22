/**
 * Tests for notification-service API key rotation/revocation — Issue #119.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('keyStore', () => {
  let tmpDir: string;
  let originalStorePath: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-keys-test-'));
    originalStorePath = process.env.API_KEY_STORE_PATH;
    process.env.API_KEY_STORE_PATH = path.join(tmpDir, 'api-keys.json');
    jest.resetModules();
  });

  afterEach(() => {
    process.env.API_KEY_STORE_PATH = originalStorePath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves no role for an unknown key', () => {
    const { resolveRoleFromStore } = require('../src/keyStore');
    expect(resolveRoleFromStore('nonexistent')).toBe('none');
  });

  it('resolves the correct role for a freshly issued key', () => {
    const { addKey, resolveRoleFromStore } = require('../src/keyStore');
    const { rawKey } = addKey('admin');
    expect(resolveRoleFromStore(rawKey)).toBe('admin');
  });

  it('rejects a revoked key with "none" (401 path)', () => {
    const { addKey, revokeKey, resolveRoleFromStore } = require('../src/keyStore');
    const { id, rawKey } = addKey('viewer');
    expect(resolveRoleFromStore(rawKey)).toBe('viewer');
    const revoked = revokeKey(id);
    expect(revoked).toBe(true);
    expect(resolveRoleFromStore(rawKey)).toBe('none');
  });

  it('rotate issues a new key and revokes the previous active one for that role', () => {
    const { addKey, rotateKey, resolveRoleFromStore } = require('../src/keyStore');
    const first = addKey('admin');
    expect(resolveRoleFromStore(first.rawKey)).toBe('admin');

    const rotated = rotateKey('admin');
    expect(rotated.revokedIds).toContain(first.id);
    expect(resolveRoleFromStore(first.rawKey)).toBe('none');
    expect(resolveRoleFromStore(rotated.rawKey)).toBe('admin');
  });

  it('never persists the raw key value, only its hash', () => {
    const { addKey } = require('../src/keyStore');
    const { rawKey } = addKey('admin');
    const raw = fs.readFileSync(process.env.API_KEY_STORE_PATH as string, 'utf-8');
    expect(raw).not.toContain(rawKey);
  });

  it('findStaleKeys flags active keys older than the threshold', () => {
    const { addKey, findStaleKeys } = require('../src/keyStore');
    const { id } = addKey('admin');

    // Directly age the key in the store file to simulate a 100-day-old key.
    const storePath = process.env.API_KEY_STORE_PATH as string;
    const store = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
    store.keys.find((k: { id: string }) => k.id === id).createdAt = new Date(
      Date.now() - 100 * 24 * 60 * 60 * 1000,
    ).toISOString();
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2));

    const stale = findStaleKeys(90);
    expect(stale.some((k: { id: string }) => k.id === id)).toBe(true);
  });
});
