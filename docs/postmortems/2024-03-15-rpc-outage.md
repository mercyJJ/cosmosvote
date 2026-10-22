# Incident Post-Mortem — RPC Outage (Example)

> **Note:** This is a **hypothetical example** populated to demonstrate how to use the postmortem template. The incident described here is fictional and is provided as a reference for teams completing their first real postmortem.

---

## Incident Summary

| Field | Value |
|-------|-------|
| **Incident ID** | INC-2024-001 |
| **Date** | 2024-03-15 |
| **Severity** | P2 |
| **Status** | Resolved |
| **Duration** | 2 hours 17 minutes |
| **Affected component(s)** | Frontend (proposal loading), backend event poller, notification service |
| **Incident commander** | @alice |
| **Authors** | @alice, @bob |

### Description

At 14:32 UTC the public Soroban RPC endpoint (`soroban-testnet.stellar.org`) became unreachable due to an upstream maintenance window that was not communicated in advance. The CosmosVote frontend displayed a blank proposal list with no error message for all users. The backend event poller silently stopped emitting events, which caused the notification service to miss three `proposal_created` events during the outage window. The incident was detected at 14:41 UTC via a user report in the project Discord, not by automated alerting.

---

## Timeline

All times in UTC.

| Time (UTC) | Event |
|------------|-------|
| 14:32 | Soroban RPC begins returning `502 Bad Gateway` — outage begins |
| 14:41 | User reports blank proposal list in Discord |
| 14:44 | On-call engineer (@alice) paged via Discord mention |
| 14:47 | @alice opens frontend, confirms blank proposal list |
| 14:52 | @alice checks backend logs — sees repeated `ECONNREFUSED soroban-testnet.stellar.org:443` errors |
| 15:03 | Root cause identified: RPC endpoint unavailable |
| 15:10 | `STELLAR_RPC_URL` in backend `.env` changed to fallback endpoint (`https://rpc.ankr.com/stellar_soroban`) |
| 15:13 | Backend restarted — proposal list populates on frontend within 30 seconds |
| 15:15 | Notification service replayed missed events by re-indexing from the last known ledger |
| 16:49 | Primary RPC endpoint restored; configuration reverted |
| 16:52 | Incident declared resolved |

---

## Root Cause Analysis

### What happened?

The Soroban RPC endpoint used for testnet (`soroban-testnet.stellar.org`) went offline for a scheduled maintenance window. No fallback RPC was configured in the backend or notification service. When the primary endpoint became unreachable, all Soroban calls failed immediately. The backend caught these errors internally but continued running silently — it did not surface the degraded state to health checks, so the `/health` and `/ready` endpoints continued returning `200 OK`.

### Why did it happen?

**5-Whys:**
1. Why did the frontend show a blank proposal list? — Because the backend event poller stopped delivering events to the notification service.
2. Why did the event poller stop? — Because every `soroban.getEvents` call was failing with a connection error.
3. Why were the calls failing? — Because the single configured RPC endpoint was unreachable.
4. Why was there no automatic failover? — Because the backend only supports a single `STELLAR_RPC_URL` and has no retry or fallback logic.
5. Why was the outage not caught by alerting before user reports? — Because the health check does not verify RPC reachability; it only checks that the process is running.

### Contributing factors

- No fallback RPC endpoint was configured
- Health checks do not probe Soroban RPC reachability (only process liveness)
- The RPC provider did not send advance notice of the maintenance window
- No synthetic monitoring or uptime check existed for the frontend's data-loading path

---

## Impact Assessment

| Dimension | Details |
|-----------|---------|
| **Users affected** | All frontend users — approximately 40 during the outage window (testnet) |
| **Proposals affected** | 0 proposals corrupted; 3 `proposal_created` events missed by the notification service |
| **Votes lost / corrupted** | None — the outage window contained no active vote periods |
| **Financial impact** | None (testnet) |
| **Data integrity** | On-chain state remained consistent; backend caught up after recovery |
| **Regulatory / compliance** | No audit trail gaps — missed notification events were replayed from Horizon |

---

## Action Items

| # | Action | Owner | Due date | Status |
|---|--------|-------|----------|--------|
| 1 | Add fallback RPC list to backend config (`STELLAR_RPC_URL_FALLBACK`) | @bob | 2024-03-22 | Open |
| 2 | Update health check to verify Soroban RPC reachability (`/ready` endpoint) | @carol | 2024-03-22 | Open |
| 3 | Add uptime monitor (e.g. Betterstack) for frontend proposal-loading path | @alice | 2024-03-29 | Open |
| 4 | Document RPC failover procedure in runbook | @bob | 2024-03-22 | Open |
| 5 | Subscribe to Stellar status page notifications | @alice | 2024-03-16 | Closed |

Action item categories:
- **Prevent recurrence:** items 1, 2 — add fallback RPC and readiness probe
- **Improve detection:** items 3, 4 — uptime monitoring and runbook
- **Reduce blast radius:** item 1 — automatic failover without manual restart

---

## Lessons Learned

### What went well?

- Recovery was fast once the root cause was identified (< 10 minutes from diagnosis to restore)
- Notification service was able to replay missed events without data loss
- On-call communication via Discord was efficient

### What went poorly?

- Incident was not detected by automated alerting — first signal was a user complaint
- Health check gave false confidence that the service was healthy
- No runbook entry existed for RPC failover, slowing diagnosis

### Where did we get lucky?

- No proposals were in their final voting minutes during the outage — a 2-hour outage during a close vote could have caused voters to miss the window
- Horizon's event history allowed full replay of missed events; a gap > 7 days would have caused permanent loss

---

## Appendix

### Relevant links

- Stellar status page: https://status.stellar.org
- Backend logs (Sentry): _(link would go here)_
- GitHub issue tracking follow-up: _(link would go here)_

### Raw logs / evidence

```
# Repeated error in backend logs during outage window
{"level":"error","event":"poll_failed","error":"connect ECONNREFUSED 13.52.44.21:443","rpcUrl":"https://soroban-testnet.stellar.org","ts":"2024-03-15T14:33:01.222Z"}
{"level":"error","event":"poll_failed","error":"connect ECONNREFUSED 13.52.44.21:443","rpcUrl":"https://soroban-testnet.stellar.org","ts":"2024-03-15T14:39:01.411Z"}

# Health endpoint response during outage (false-positive healthy)
HTTP/1.1 200 OK
{"status":"ok"}

# First successful poll after failover to backup RPC
{"level":"info","event":"poll_ok","ledger":9183042,"eventsFound":3,"rpcUrl":"https://rpc.ankr.com/stellar_soroban","ts":"2024-03-15T15:13:44.002Z"}
```
