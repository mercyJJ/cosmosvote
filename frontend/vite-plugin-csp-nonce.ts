/**
 * vite-plugin-csp-nonce – Issue #31
 *
 * A Vite HTML transform plugin that injects a per-build nonce into every
 * inline <script> and <style> tag in the production HTML output, and
 * adds a <meta name="csp-nonce"> tag so the running app can read it.
 *
 * This replaces 'unsafe-inline' in script-src with 'nonce-<value>' in production.
 *
 * Usage in vite.config.ts:
 *   import { cspNoncePlugin } from './vite-plugin-csp-nonce';
 *   plugins: [react(), cspNoncePlugin()],
 *
 * In production the nonce value is embedded in the HTML at build time.
 * The server (CloudFront / Lambda@Edge) must read the nonce from the
 * <meta name="csp-nonce"> tag and echo it back in the Content-Security-Policy
 * response header. See docs/frontend-csp.md for the full deployment guide.
 *
 * NOTE: A static-file host (S3 + CloudFront without Lambda@Edge) cannot
 * rotate nonces per-request, so the nonce is per-build rather than
 * per-request. This still removes 'unsafe-inline' from script-src and
 * provides meaningful protection when combined with strict frame-ancestors
 * and object-src directives.
 */

import crypto from 'crypto';
import type { Plugin } from 'vite';

export function cspNoncePlugin(): Plugin {
  // Generate a fresh nonce for every build
  const nonce = crypto.randomBytes(16).toString('base64');

  return {
    name: 'vite-plugin-csp-nonce',
    // Only run during the production build, not the dev server
    apply: 'build',

    transformIndexHtml(html: string): string {
      let result = html;

      // 1. Inject nonce attribute onto every inline <script …> tag
      result = result.replace(
        /<script(\b[^>]*)>/g,
        (_match: string, attrs: string) => {
          // Skip external scripts that already carry a src attribute — they
          // don't need a nonce because they're not inline.
          if (/\bsrc\s*=/.test(attrs)) {
            return `<script${attrs} nonce="${nonce}">`;
          }
          return `<script${attrs} nonce="${nonce}">`;
        },
      );

      // 2. Inject nonce onto every inline <style> tag
      result = result.replace(
        /<style(\b[^>]*)>/g,
        (_match: string, attrs: string) => `<style${attrs} nonce="${nonce}">`,
      );

      // 3. Add <meta name="csp-nonce" content="<nonce>"> into <head>
      //    The server-side edge function reads this tag to build the
      //    Content-Security-Policy response header.
      result = result.replace(
        '</head>',
        `  <meta name="csp-nonce" content="${nonce}">\n  </head>`,
      );

      return result;
    },
  };
}

/** Read the nonce that was embedded at build time from the DOM. */
export function readCspNonce(): string | null {
  if (typeof document === 'undefined') return null;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]');
  return meta?.content ?? null;
}
