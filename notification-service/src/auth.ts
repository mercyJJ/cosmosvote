/**
 * Role-based access control for the notification service admin API.
 *
 * Roles:
 *   admin  — full access (subscribe, unsubscribe, list, config)
 *   viewer — read-only access (list only)
 *
 * Authentication uses a Bearer token compared against environment variables:
 *   ADMIN_API_KEY  — grants admin role
 *   VIEWER_API_KEY — grants viewer role (optional)
 *
 * If neither key is configured the service runs in open mode (development
 * only). Warn loudly at startup when no keys are set.
 */

import { resolveRoleFromStore } from './keyStore';

export type Role = 'admin' | 'viewer' | 'none';

const ADMIN_KEY  = process.env.ADMIN_API_KEY  ?? '';
const VIEWER_KEY = process.env.VIEWER_API_KEY ?? '';

if (!ADMIN_KEY) {
  console.warn(
    '[auth] WARNING: ADMIN_API_KEY is not set. ' +
    'Admin endpoints are unprotected. Set ADMIN_API_KEY in production.',
  );
}

/**
 * Resolve the role for a raw Authorization header value.
 *
 * Issue #119 — key rotation: keys issued via the key-store (see
 * `keyStore.ts` / `scripts/rotate-notification-key.ts`) are checked first
 * so that a revoked key is rejected (401) immediately, even if it still
 * happens to match a legacy env-var key. The static ADMIN_API_KEY /
 * VIEWER_API_KEY env vars remain supported for backward compatibility with
 * deployments that have not migrated to the rotating key store yet.
 */
export function resolveRole(authHeader: string | undefined): Role {
  if (!authHeader) return 'none';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  const storeRole = resolveRoleFromStore(token);
  if (storeRole !== 'none') return storeRole;

  if (ADMIN_KEY  && token === ADMIN_KEY)  return 'admin';
  if (VIEWER_KEY && token === VIEWER_KEY) return 'viewer';
  return 'none';
}

/** Return true when the given role satisfies the required minimum role. */
export function hasRole(actual: Role, required: Role): boolean {
  if (required === 'none')   return true;
  if (required === 'viewer') return actual === 'viewer' || actual === 'admin';
  if (required === 'admin')  return actual === 'admin';
  return false;
}

/** Throw an error when the caller lacks the required role. */
export function requireRole(authHeader: string | undefined, required: Role): void {
  const role = resolveRole(authHeader);
  if (!hasRole(role, required)) {
    const err = new Error(
      role === 'none' ? 'Unauthorized: missing or invalid API key.' : 'Forbidden: insufficient role.',
    );
    (err as NodeJS.ErrnoException).code = role === 'none' ? 'UNAUTHORIZED' : 'FORBIDDEN';
    throw err;
  }
}
