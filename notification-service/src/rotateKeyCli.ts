#!/usr/bin/env ts-node
/**
 * CLI for rotating/revoking notification-service API keys — Issue #119.
 *
 * Usage:
 *   ts-node src/rotateKeyCli.ts rotate <admin|viewer>
 *   ts-node src/rotateKeyCli.ts revoke <keyId>
 *   ts-node src/rotateKeyCli.ts list
 *   ts-node src/rotateKeyCli.ts check-stale [maxAgeDays]
 */

import { addKey, rotateKey, revokeKey, listKeys, findStaleKeys, KeyRole } from './keyStore';

function usageAndExit(): never {
  console.error(
    'Usage:\n' +
      '  rotate <admin|viewer>   generate a new key and revoke the previous active one for that role\n' +
      '  issue <admin|viewer>    issue a new key without revoking any existing key\n' +
      '  revoke <keyId>          revoke a specific key by id\n' +
      '  list                    list all keys (id, role, createdAt, revokedAt)\n' +
      '  check-stale [days]      list active keys older than <days> (default 90)\n',
  );
  process.exit(1);
}

function isRole(x: string): x is KeyRole {
  return x === 'admin' || x === 'viewer';
}

function main(): void {
  const [cmd, arg1] = process.argv.slice(2);

  switch (cmd) {
    case 'rotate': {
      if (!arg1 || !isRole(arg1)) usageAndExit();
      const { id, rawKey, revokedIds } = rotateKey(arg1);
      console.log(`Rotated ${arg1} key.`);
      console.log(`  New key id: ${id}`);
      console.log(`  New key value (store securely, shown once): ${rawKey}`);
      if (revokedIds.length) {
        console.log(`  Revoked previous key id(s): ${revokedIds.join(', ')}`);
      } else {
        console.log('  No previous active key found for this role.');
      }
      break;
    }
    case 'issue': {
      if (!arg1 || !isRole(arg1)) usageAndExit();
      const { id, rawKey } = addKey(arg1);
      console.log(`Issued new ${arg1} key id=${id}`);
      console.log(`Key value (shown once): ${rawKey}`);
      break;
    }
    case 'revoke': {
      if (!arg1) usageAndExit();
      const ok = revokeKey(arg1);
      console.log(ok ? `Revoked key ${arg1}.` : `Key ${arg1} not found or already revoked.`);
      break;
    }
    case 'list': {
      for (const k of listKeys()) {
        console.log(
          `${k.id}  role=${k.role}  createdAt=${k.createdAt}  revokedAt=${k.revokedAt ?? '-'}`,
        );
      }
      break;
    }
    case 'check-stale': {
      const maxAgeDays = arg1 ? Number(arg1) : 90;
      const stale = findStaleKeys(maxAgeDays);
      if (stale.length === 0) {
        console.log(`OK: no active keys older than ${maxAgeDays} days.`);
        break;
      }
      console.error(`ALERT: ${stale.length} active key(s) exceed ${maxAgeDays}-day rotation window:`);
      for (const k of stale) {
        console.error(`  id=${k.id} role=${k.role} createdAt=${k.createdAt}`);
      }
      process.exitCode = 2;
      break;
    }
    default:
      usageAndExit();
  }
}

main();
