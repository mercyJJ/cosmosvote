/**
 * Simple in-memory sliding-window rate limiter for Node's http.Server.
 *
 * Configuration (env vars):
 *   RATE_LIMIT_WINDOW_MS  – window length in milliseconds (default: 60 000 = 1 min)
 *   RATE_LIMIT_MAX        – max requests per window per IP (default: 60)
 */

import type { IncomingMessage, ServerResponse } from 'http';

export interface RateLimiterOptions {
  windowMs?: number;
  max?: number;
}

interface IpEntry {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly windowMs: number;
  private readonly max: number;
  private readonly store = new Map<string, IpEntry>();

  constructor(opts: RateLimiterOptions = {}) {
    this.windowMs = opts.windowMs ?? Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
    this.max = opts.max ?? Number(process.env.RATE_LIMIT_MAX ?? 60);
  }

  /**
   * Check whether the request should be allowed.
   * Returns `true` if the request is within the limit, `false` if it should be
   * rejected with 429.
   */
  check(ip: string): { allowed: boolean; retryAfterSecs: number } {
    const now = Date.now();
    let entry = this.store.get(ip);

    if (!entry || now > entry.resetAt) {
      entry = { count: 1, resetAt: now + this.windowMs };
      this.store.set(ip, entry);
      return { allowed: true, retryAfterSecs: 0 };
    }

    entry.count += 1;

    if (entry.count > this.max) {
      const retryAfterSecs = Math.ceil((entry.resetAt - now) / 1_000);
      return { allowed: false, retryAfterSecs };
    }

    return { allowed: true, retryAfterSecs: 0 };
  }

  /** Periodically clean up expired entries to avoid unbounded memory growth. */
  startCleanup(intervalMs = 5 * 60_000): ReturnType<typeof setInterval> {
    return setInterval(() => {
      const now = Date.now();
      for (const [ip, entry] of this.store) {
        if (now > entry.resetAt) this.store.delete(ip);
      }
    }, intervalMs);
  }
}

/** Extract the real client IP from the request, respecting X-Forwarded-For. */
export function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return first.trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/**
 * Apply rate limiting to a response.
 * Returns `true` if the response was handled (429 sent) so the caller can return early.
 */
export function applyRateLimit(
  limiter: RateLimiter,
  req: IncomingMessage,
  res: ServerResponse
): boolean {
  const ip = getClientIp(req);
  const { allowed, retryAfterSecs } = limiter.check(ip);

  if (!allowed) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Retry-After', String(retryAfterSecs));
    res.writeHead(429);
    res.end(JSON.stringify({ error: 'Too Many Requests', retryAfter: retryAfterSecs }));
    return true;
  }

  return false;
}
