# Wallet Integration Security

This document covers security considerations for integrating browser wallets (e.g., Freighter) with the CosmosVote frontend. See also [threat-model.md](./threat-model.md) and [known-issues.md](./known-issues.md).

Related frontend issues: [#312](https://github.com/mercyJJ/cosmosvote/issues/312), [#314](https://github.com/mercyJJ/cosmosvote/issues/314).

---

## Content Security Policy (CSP)

A strict CSP prevents cross-site scripting (XSS) and data-exfiltration attacks. Add the following `<meta>` tag (or equivalent HTTP header) to `index.html`:

```html
<meta http-equiv="Content-Security-Policy"
  content="
    default-src 'self';
    script-src  'self';
    connect-src 'self' https://horizon-testnet.stellar.org https://horizon.stellar.org https://rpc-futurenet.stellar.org;
    style-src   'self' 'unsafe-inline';
    img-src     'self' data:;
    object-src  'none';
    frame-ancestors 'none';
  ">
```

Key directives:

| Directive | Value | Reason |
|-----------|-------|--------|
| `default-src` | `'self'` | Deny all unlisted origins by default |
| `script-src` | `'self'` | Block inline scripts and third-party JS |
| `connect-src` | Stellar RPC endpoints | Allow only known Horizon/RPC hosts |
| `object-src` | `'none'` | Block Flash / legacy plugins |
| `frame-ancestors` | `'none'` | Prevent clickjacking |

> **Note:** Avoid `'unsafe-inline'` and `'unsafe-eval'` in `script-src`. If a bundler injects inline scripts, use a nonce or hash instead.

---

## Trusted Wallet Practices

### Only use audited wallet extensions

CosmosVote is tested against [Freighter](https://www.freighter.app/). Before requesting wallet access:

1. Check that `window.freighter` (or the WalletConnect provider) is present.
2. Verify the extension origin against Freighter's published extension ID — do **not** accept injected providers from unknown origins.
3. Never store the user's secret key or mnemonic in `localStorage`, `sessionStorage`, or any JavaScript variable.

### Wallet connection flow

```ts
// Recommended pattern — request permission explicitly
const { isConnected } = await window.freighter.isConnected();
if (!isConnected) {
  throw new Error("Freighter not available");
}
const publicKey = await window.freighter.getPublicKey();
// Use publicKey for read-only display; sign transactions via freighter.signTransaction()
```

- Request only `getPublicKey` scope on initial connect; request signing only when the user initiates a transaction.
- Always display the transaction XDR to the user before requesting signature.

---

## User Privacy

- **Do not log public keys** to any analytics service or third-party endpoint.
- Wallet addresses are pseudonymous but linkable on-chain; inform users that their votes are publicly visible.
- Do not use third-party scripts (e.g., Google Analytics, Mixpanel) on pages that trigger wallet interactions — any XSS in those scripts could intercept signing prompts.

---

## Phishing Mitigation

1. **Pin the domain.** Serve the frontend only from the canonical domain; do not mirror it on other hosts.
2. **Subresource Integrity (SRI).** If loading any assets from a CDN, add `integrity` and `crossorigin` attributes:
   ```html
   <script src="https://cdn.example.com/lib.js"
     integrity="sha384-<hash>"
     crossorigin="anonymous"></script>
   ```
3. **HTTPS only.** Redirect all HTTP traffic to HTTPS; set `Strict-Transport-Security: max-age=63072000; includeSubDomains`.
4. **Warn on domain mismatch.** If the page origin does not match the expected production domain, display a visible warning before any wallet interaction.
5. **No auto-connect.** Never call `getPublicKey()` or `signTransaction()` on page load without explicit user action.

---

## Checklist

- [ ] CSP header/meta tag is present and tested with a CSP evaluator
- [ ] No `'unsafe-inline'` or `'unsafe-eval'` in `script-src`
- [ ] Freighter extension ID verified before accepting provider
- [ ] No secrets stored client-side
- [ ] HTTPS enforced with HSTS header
- [ ] SRI attributes on any CDN-loaded assets
- [ ] No third-party analytics scripts on wallet-interaction pages
- [ ] Canonical domain pinned; phishing warning on domain mismatch
