import { RateLimiter, applyRateLimit, getClientIp } from '../src/rateLimiter';
import type { IncomingMessage, ServerResponse } from 'http';

function makeFakeReq(ip: string, forwarded?: string): Partial<IncomingMessage> {
  return {
    headers: forwarded ? { 'x-forwarded-for': forwarded } : {},
    socket: { remoteAddress: ip } as NodeJS.Socket,
  };
}

function makeFakeRes(): {
  res: Partial<ServerResponse>;
  statusCode: number | null;
  headers: Record<string, string>;
  body: string;
} {
  const ctx = { statusCode: null as number | null, headers: {} as Record<string, string>, body: '' };
  const res: Partial<ServerResponse> = {
    setHeader(name: string, value: string | number | readonly string[]) {
      ctx.headers[name] = String(value);
      return this as ServerResponse;
    },
    writeHead(code: number) {
      ctx.statusCode = code;
      return this as ServerResponse;
    },
    end(chunk?: unknown) {
      ctx.body = String(chunk ?? '');
      return this as ServerResponse;
    },
  };
  return { res, ...ctx };
}

describe('RateLimiter', () => {
  it('allows requests within the limit', () => {
    const limiter = new RateLimiter({ windowMs: 60_000, max: 3 });
    expect(limiter.check('1.2.3.4').allowed).toBe(true);
    expect(limiter.check('1.2.3.4').allowed).toBe(true);
    expect(limiter.check('1.2.3.4').allowed).toBe(true);
  });

  it('blocks the (max + 1)th request and returns retryAfterSecs > 0', () => {
    const limiter = new RateLimiter({ windowMs: 60_000, max: 3 });
    limiter.check('5.5.5.5');
    limiter.check('5.5.5.5');
    limiter.check('5.5.5.5');
    const result = limiter.check('5.5.5.5');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSecs).toBeGreaterThan(0);
  });

  it('tracks different IPs independently', () => {
    const limiter = new RateLimiter({ windowMs: 60_000, max: 1 });
    expect(limiter.check('10.0.0.1').allowed).toBe(true);
    expect(limiter.check('10.0.0.2').allowed).toBe(true);
    // Second request for first IP should be rejected
    expect(limiter.check('10.0.0.1').allowed).toBe(false);
    // First IP rejection should not affect second IP's first request
    expect(limiter.check('10.0.0.2').allowed).toBe(false);
  });

  it('resets the count after the window expires', () => {
    jest.useFakeTimers();
    const limiter = new RateLimiter({ windowMs: 1_000, max: 1 });
    expect(limiter.check('9.9.9.9').allowed).toBe(true);
    expect(limiter.check('9.9.9.9').allowed).toBe(false);
    jest.advanceTimersByTime(1_001);
    expect(limiter.check('9.9.9.9').allowed).toBe(true);
    jest.useRealTimers();
  });
});

describe('getClientIp', () => {
  it('returns remoteAddress when no X-Forwarded-For header', () => {
    const req = makeFakeReq('1.2.3.4') as IncomingMessage;
    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('returns the first IP in X-Forwarded-For', () => {
    const req = makeFakeReq('1.2.3.4', '9.8.7.6, 1.1.1.1') as IncomingMessage;
    expect(getClientIp(req)).toBe('9.8.7.6');
  });
});

describe('applyRateLimit', () => {
  it('returns false and does not send a response when within limit', () => {
    const limiter = new RateLimiter({ windowMs: 60_000, max: 10 });
    const { res, statusCode } = makeFakeRes();
    const req = makeFakeReq('1.1.1.1') as IncomingMessage;
    const handled = applyRateLimit(limiter, req, res as ServerResponse);
    expect(handled).toBe(false);
    expect(statusCode).toBeNull();
  });

  it('returns true, sends 429 with Retry-After header on limit breach', () => {
    const limiter = new RateLimiter({ windowMs: 60_000, max: 1 });
    const req = makeFakeReq('2.2.2.2') as IncomingMessage;
    // Consume the 1 allowed request
    limiter.check('2.2.2.2');
    const fake = makeFakeRes();
    const handled = applyRateLimit(limiter, req, fake.res as ServerResponse);
    expect(handled).toBe(true);
    expect(fake.statusCode).toBe(429);
    expect(fake.headers['Retry-After']).toBeDefined();
    expect(Number(fake.headers['Retry-After'])).toBeGreaterThan(0);
    const body = JSON.parse(fake.body) as { error: string; retryAfter: number };
    expect(body.error).toBe('Too Many Requests');
  });
});
