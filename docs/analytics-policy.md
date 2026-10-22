# Analytics & Privacy Policy

## Overview

CosmosVote includes an **opt-in**, privacy-preserving analytics module to understand how the application is used. Analytics are **disabled by default** and collect no personally identifiable information (PII).

## What Is Collected

| Field | Description |
|-------|-------------|
| `name` | Event name (e.g. `proposal_viewed`, `vote_cast`) |
| `ts` | Unix timestamp (milliseconds) of the event |
| `sessionId` | Anonymous UUID generated at page load; not persisted across sessions |
| `props` | Optional non-identifying metadata (e.g. proposal ID as a number) |

### Tracked Events

| Event | When fired |
|-------|-----------|
| `proposal_viewed` | User views a proposal detail page |
| `vote_cast` | User submits a vote |
| `wallet_connected` | User connects a wallet |
| `wallet_disconnected` | User disconnects a wallet |

## What Is NOT Collected

- Wallet addresses or public keys
- IP addresses
- Names, emails, or any personal identifiers
- Browser fingerprints
- Cross-session tracking identifiers

## Data Retention

Events are batched in memory and `localStorage` (as a write-ahead buffer) and flushed either every 30 seconds, when the batch reaches 10 events, or when the page is hidden.

- **No persistent server storage is required.** Operators may choose to store aggregated, anonymized counts only.
- The `localStorage` key `_analytics_queue` is cleared after each successful flush.
- If no `VITE_ANALYTICS_ENDPOINT` is configured, events are only logged to the browser console in development mode and never leave the client.

## How to Opt Out

A **cookie consent banner** appears on first visit. You can:

- Click **Reject** to disable all analytics — no events will be sent.
- Click **Accept** to allow anonymous analytics collection.

Your choice is saved in `localStorage` under the key `analytics_consent` and persists across sessions. You can change your preference at any time by clearing site data or using the banner if it reappears.

Analytics are also **disabled by default** at the operator level. To confirm they remain off, ensure your `.env` file does not set `VITE_ANALYTICS_ENABLED=true`:

```env
# analytics disabled (default)
VITE_ANALYTICS_ENABLED=false
```

To enable analytics, set both variables:

```env
VITE_ANALYTICS_ENABLED=true
VITE_ANALYTICS_ENDPOINT=https://your-analytics-endpoint.example.com/events
```

## Implementation

See [`frontend/src/analytics.ts`](../frontend/src/analytics.ts). The module uses no third-party SDKs and makes no outbound requests unless `VITE_ANALYTICS_ENABLED=true` and `VITE_ANALYTICS_ENDPOINT` is set.
