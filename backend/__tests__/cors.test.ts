/**
 * Tests for the shared CORS utility.
 */

describe('cors utility', () => {
  const ORIGINAL_ENV = process.env.ALLOWED_ORIGINS;

  afterEach(() => {
    // Reset env between tests
    if (ORIGINAL_ENV === undefined) {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      process.env.ALLOWED_ORIGINS = ORIGINAL_ENV;
    }
    jest.resetModules();
  });

  function loadCors(allowedOrigins?: string) {
    if (allowedOrigins === undefined) {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      process.env.ALLOWED_ORIGINS = allowedOrigins;
    }
    // Re-require so module-level parsing picks up the new env value
    return require('../src/cors') as typeof import('../src/cors');
  }

  it('allows a single configured origin', () => {
    const { isOriginAllowed } = loadCors('https://app.example.com');
    expect(isOriginAllowed('https://app.example.com')).toBe(true);
  });

  it('allows multiple origins from comma-separated list', () => {
    const { isOriginAllowed } = loadCors(
      'https://app.example.com, https://staging.example.com',
    );
    expect(isOriginAllowed('https://app.example.com')).toBe(true);
    expect(isOriginAllowed('https://staging.example.com')).toBe(true);
  });

  it('rejects an origin not in the allowlist', () => {
    const { isOriginAllowed } = loadCors('https://app.example.com');
    expect(isOriginAllowed('https://evil.example.com')).toBe(false);
  });

  it('rejects undefined origin', () => {
    const { isOriginAllowed } = loadCors('https://app.example.com');
    expect(isOriginAllowed(undefined)).toBe(false);
  });

  it('returns empty set when ALLOWED_ORIGINS is not set', () => {
    const { ALLOWED_ORIGINS } = loadCors(undefined);
    expect(ALLOWED_ORIGINS.size).toBe(0);
  });

  it('corsHeaders returns correct CORS headers for an origin', () => {
    const { corsHeaders } = loadCors('https://app.example.com');
    const headers = corsHeaders('https://app.example.com');
    const map = Object.fromEntries(headers);
    expect(map['Access-Control-Allow-Origin']).toBe('https://app.example.com');
    expect(map['Vary']).toBe('Origin');
  });
});
