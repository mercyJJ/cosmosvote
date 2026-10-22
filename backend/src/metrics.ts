/**
 * metrics.ts — Prometheus metrics for the CosmosVote notification service.
 *
 * Exposes a /metrics endpoint via prom-client so Prometheus can scrape:
 *   notification_sent_total
 *   notification_failed_total
 *   webhook_latency_seconds
 *   active_subscriptions
 *
 * Usage:
 *   import { metrics, metricsHandler } from './metrics';
 *   metrics.notificationSent.inc();
 */

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { IncomingMessage, ServerResponse } from 'http';

// ── Registry ────────────────────────────────────────────────────────────────

export const registry = new Registry();
registry.setDefaultLabels({ service: 'cosmosvote-notification' });

// Collect default Node.js metrics (heap, GC, event loop lag, …) into our registry.
collectDefaultMetrics({ register: registry });

// ── Application metrics ─────────────────────────────────────────────────────

/**
 * Total number of notifications successfully sent.
 */
export const notificationSentTotal = new Counter({
  name: 'notification_sent_total',
  help: 'Total number of webhook notifications successfully delivered.',
  labelNames: ['contract_id'] as const,
  registers: [registry],
});

/**
 * Total number of notification delivery failures (after all retries).
 */
export const notificationFailedTotal = new Counter({
  name: 'notification_failed_total',
  help: 'Total number of webhook notifications that failed after all retry attempts.',
  labelNames: ['contract_id'] as const,
  registers: [registry],
});

/**
 * Webhook HTTP request latency in seconds (histogram with default buckets).
 */
export const webhookLatencySeconds = new Histogram({
  name: 'webhook_latency_seconds',
  help: 'Latency of individual webhook delivery attempts in seconds.',
  labelNames: ['contract_id', 'status_code'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

/**
 * Number of currently active contract subscriptions being polled.
 */
export const activeSubscriptions = new Gauge({
  name: 'active_subscriptions',
  help: 'Number of contract subscriptions currently being polled for events.',
  registers: [registry],
});

// ── HTTP handler ────────────────────────────────────────────────────────────

/**
 * Express-compatible (or plain http.Server) handler for GET /metrics.
 * Returns the current registry snapshot in Prometheus text format.
 */
export async function metricsHandler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (req.method !== 'GET') {
    res.writeHead(405, { Allow: 'GET' });
    res.end('Method Not Allowed');
    return;
  }

  try {
    const content = await registry.metrics();
    res.writeHead(200, { 'Content-Type': registry.contentType });
    res.end(content);
  } catch (err) {
    res.writeHead(500);
    res.end('Internal Server Error');
  }
}
