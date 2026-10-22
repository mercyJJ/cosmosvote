/**
 * CORS middleware utility for the CosmosVote backend.
 *
 * Reads ALLOWED_ORIGINS from the environment as a comma-separated list of
 * origins.  If the env var is unset, no origin is allowed (restrictive
 * default — never a wildcard in production).
 *
 * Usage:
 *   import { corsHeaders, isOriginAllowed } from './cors';
 *   const allowed = isOriginAllowed(request.headers.origin);
 *   if (!allowed) { res.writeHead(403); res.end(); return; }
 *   corsHeaders(origin).forEach(([k, v]) => res.setHeader(k, v));
 */

/** Parse ALLOWED_ORIGINS into a frozen Set of normalised origins. */
function parseAllowedOrigins(raw: string | undefined): ReadonlySet<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((o) => o.trim().toLowerCase().replace(/\/+$/, ''))
      .filter(Boolean),
  );
}

export const ALLOWED_ORIGINS: ReadonlySet<string> = parseAllowedOrigins(
  process.env.ALLOWED_ORIGINS,
);

/** Returns true if the origin is in the allowlist. */
export function isOriginAllowed(origin: string | undefined): origin is string {
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin.toLowerCase().replace(/\/+$/, ''));
}

/** Returns the CORS response headers for an allowed origin. */
export function corsHeaders(
  origin: string,
): [string, string][] {
  return [
    ['Access-Control-Allow-Origin', origin],
    ['Access-Control-Allow-Methods', 'POST, OPTIONS'],
    ['Access-Control-Allow-Headers', 'Content-Type'],
    ['Access-Control-Max-Age', '600'],
    ['Vary', 'Origin'],
  ];
}
