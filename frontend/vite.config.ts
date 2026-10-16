/**
 * Vite configuration for CosmosVote frontend.
 *
 * Issue #31: added cspNoncePlugin() for production builds.
 * The plugin injects a per-build nonce into every inline script/style tag
 * and embeds a <meta name="csp-nonce"> tag so the server-side edge function
 * (Lambda@Edge / CloudFront Function) can echo it in the CSP response header,
 * eliminating the need for 'unsafe-inline' in script-src for production.
 *
 * See docs/frontend-csp.md for the full production deployment guide.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cspNoncePlugin } from './vite-plugin-csp-nonce';

// ── CSP values ────────────────────────────────────────────────────────────────

/**
 * Development CSP (served by Vite dev server).
 * Allows 'unsafe-eval' for HMR and a ws:// WebSocket for live reload.
 * 'unsafe-inline' is allowed for styles only (React inline style props).
 */
const DEV_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  // HMR requires eval
  "script-src 'self' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' http://localhost:3001 https://soroban-testnet.stellar.org https://soroban-mainnet.stellar.org ws://localhost:5173",
].join('; ');

/**
 * Production CSP header template.
 * 'unsafe-inline' is intentionally absent from script-src.
 * The server must replace the placeholder with the actual nonce from
 * <meta name="csp-nonce"> before setting the header.
 *
 * This value is NOT used directly by Vite — it is here for documentation and
 * for the Terraform / Lambda@Edge configuration to reference.
 *
 * Stellar SDK workers: the Stellar SDK spawns Web Workers from blob: URLs.
 * worker-src blob: permits this without unsafe-inline in script-src.
 */
export const PRODUCTION_CSP_TEMPLATE = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  // Replace {{NONCE}} with the actual nonce at request time
  "script-src 'self' 'nonce-{{NONCE}}'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  // Stellar SDK Web Workers run from blob: URLs
  "worker-src blob:",
  "connect-src 'self' https://soroban-testnet.stellar.org https://soroban-mainnet.stellar.org",
  // CSP violation reporting endpoint (configure via VITE_CSP_REPORT_URI)
  "report-uri /api/csp-report",
].join('; ');

// ── Vite config ───────────────────────────────────────────────────────────────

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // Inject per-build nonce in production only (Issue #31)
    ...(mode === 'production' ? [cspNoncePlugin()] : []),
  ],

  server: {
    port: 5173,
    headers: {
      'Content-Security-Policy': DEV_CSP,
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
  },

  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
}));
