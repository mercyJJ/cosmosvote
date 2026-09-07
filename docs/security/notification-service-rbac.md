# Role-Based Access Control — Notification Service

_Relates to issue [#368](https://github.com/mercyJJ/cosmosvote/issues/368)._

---

## Overview

The notification service exposes administrative operations (adding subscribers,
removing subscribers, listing all subscriptions) that must not be publicly
accessible. This document describes the role-based access control (RBAC) model
and how to configure it.

---

## Roles

| Role | Permissions |
|------|-------------|
| `admin` | Subscribe, unsubscribe, list subscribers, change config |
| `viewer` | List subscribers (read-only) |
| `none` | No access to protected operations |

---

## Authentication

All protected operations require a `Bearer` token in the `Authorization` header:

```
Authorization: Bearer <api-key>
```

The token is compared against environment variables:

| Variable | Role granted |
|----------|-------------|
| `ADMIN_API_KEY` | `admin` |
| `VIEWER_API_KEY` | `viewer` (optional) |

If `ADMIN_API_KEY` is not set the service logs a warning and runs in open mode.
**Never run without a key in production.**

---

## Configuration

Add to `notification-service/.env`:

```bash
ADMIN_API_KEY=<strong-random-secret>   # required in production
VIEWER_API_KEY=<another-random-secret> # optional read-only key
```

Generate a key:
```bash
openssl rand -hex 32
```

---

## Protected Endpoints (CLI / HTTP)

| Operation | Required role |
|-----------|--------------|
| `subscribe` | `admin` |
| `unsubscribe` | `admin` |
| `list` | `viewer` or `admin` |
| `start` (watcher) | no auth required (internal process) |

---

## Implementation

RBAC is implemented in `notification-service/src/auth.ts`.

```typescript
import { requireRole } from './auth';

// Require admin role before adding a subscriber
requireRole(req.headers.authorization, 'admin');
addSubscriber({ ... });
```

The `requireRole` helper throws with code `UNAUTHORIZED` (missing/invalid key)
or `FORBIDDEN` (insufficient role) so callers can map these to HTTP 401 / 403
responses.

---

## Tests

Tests are in `notification-service/__tests__/auth.test.ts` and cover:

- Correct role resolution for admin / viewer / unknown tokens
- `hasRole` hierarchy (admin ⊇ viewer ⊇ none)
- `requireRole` throws `Unauthorized` for missing/invalid tokens
- `requireRole` throws `Forbidden` when viewer attempts admin operation

Run tests:
```bash
cd notification-service
npx jest __tests__/auth.test.ts
```
