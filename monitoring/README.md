# Monitoring Dashboards

This directory contains observability templates for CosmosVote deployments.

| File | Description |
|------|-------------|
| `grafana-dashboard.json` | Grafana dashboard — import via UI or provisioning |
| `alerts.yml` | Prometheus alerting rules |

---

## Backend `/metrics` endpoint

The CosmosVote notification service exposes a Prometheus-compatible `/metrics` endpoint
on the same port as the health checks (default **8080**).

### Exposed metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `notification_sent_total` | Counter | `service`, `contract_id` | Webhook notifications successfully delivered |
| `notification_failed_total` | Counter | `service`, `contract_id` | Notifications that failed after all retries |
| `webhook_latency_seconds` | Histogram | `service`, `contract_id`, `status_code` | Per-attempt webhook delivery latency |
| `active_subscriptions` | Gauge | `service` | Contract subscriptions currently being polled |

Default Node.js / process metrics (heap, GC, event-loop lag, …) are also collected
automatically via `prom-client`'s `collectDefaultMetrics`.

### Prometheus scrape configuration

Add the following job to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: cosmosvote-notification
    static_configs:
      - targets:
          - <backend-host>:8080   # replace with the actual host / service name
    metrics_path: /metrics
    scrape_interval: 15s
```

If you are running with Docker Compose, use the service name as the target:

```yaml
scrape_configs:
  - job_name: cosmosvote-notification
    static_configs:
      - targets:
          - cosmosvote-backend:8080
    metrics_path: /metrics
    scrape_interval: 15s
```

For Kubernetes / Prometheus Operator, annotate the Pod:

```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "8080"
  prometheus.io/path: "/metrics"
```

---

## Metrics Reference (full set)

The following metrics are expected from the CosmosVote indexer/relayer service.

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `notification_sent_total` | Counter | `service`, `contract_id` | Webhook notifications delivered |
| `notification_failed_total` | Counter | `service`, `contract_id` | Notifications that failed (all retries exhausted) |
| `webhook_latency_seconds` | Histogram | `service`, `contract_id`, `status_code` | Delivery latency per attempt |
| `active_subscriptions` | Gauge | `service` | Contracts currently being polled |
| `cosmosvote_rpc_requests_total` | Counter | `network`, `method` | Total RPC calls made |
| `cosmosvote_rpc_errors_total` | Counter | `network`, `method`, `code` | Failed RPC calls |
| `cosmosvote_rpc_request_duration_ms` | Histogram | `network`, `method` | RPC call latency in milliseconds |
| `cosmosvote_events_polled_total` | Counter | `network`, `event_type` | Raw events fetched from chain |
| `cosmosvote_events_processed_total` | Counter | `network`, `event_type` | Events successfully processed |
| `cosmosvote_event_poll_attempts_total` | Counter | `network` | Total polling attempts |
| `cosmosvote_event_poll_errors_total` | Counter | `network` | Polling attempts that failed |
| `cosmosvote_event_poll_lag_seconds` | Gauge | `network` | Seconds the poller is behind the chain tip |
| `cosmosvote_proposals_active` | Gauge | `network` | Number of currently active proposals |
| `cosmosvote_votes_cast_total` | Counter | `network` | Cumulative votes cast |

---

## Connecting the Grafana Dashboard

### Option 1 — Import via UI

1. Open Grafana → **Dashboards → Import**.
2. Upload `grafana-dashboard.json` or paste its contents.
3. Select your **Prometheus** data source when prompted.
4. Click **Import**.

### Option 2 — Provisioning (recommended for automated setups)

Place the file in your Grafana provisioning directory:

```
/etc/grafana/provisioning/dashboards/cosmosvote/grafana-dashboard.json
```

Create a provisioning config at `/etc/grafana/provisioning/dashboards/cosmosvote.yaml`:

```yaml
apiVersion: 1
providers:
  - name: cosmosvote
    folder: CosmosVote
    type: file
    options:
      path: /etc/grafana/provisioning/dashboards/cosmosvote
```

Restart Grafana. The dashboard will appear under the **CosmosVote** folder.

---

## Connecting Prometheus Alerts

Add the alerts file to your Prometheus configuration:

```yaml
# prometheus.yml
rule_files:
  - /path/to/cosmosvote/monitoring/alerts.yml
```

Or, if using the Prometheus Operator (Kubernetes):

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: cosmosvote-alerts
spec:
  groups: [] # paste contents of alerts.yml groups here
```

Reload Prometheus (`SIGHUP` or `/-/reload` endpoint) to pick up the rules.

---

## Dashboard Variables

The dashboard exposes a **Network** template variable (`testnet` / `mainnet`) that filters all panels to a single deployment. Add additional values as you deploy to more networks.

---

## Alerting Thresholds

| Alert | Threshold | Severity |
|-------|-----------|----------|
| `HighRpcLatency` | p95 > 2 000 ms for 5 min | warning |
| `HighRpcErrorRate` | error rate > 5 % for 5 min | critical |
| `EventPollingLag` | lag > 300 s for 2 min | warning |
| `RpcTargetDown` | target unreachable for 1 min | critical |

Adjust thresholds in `alerts.yml` to match your SLA requirements.
