# ADR-007: Time-Lock on `update_quorum`

**Status:** Accepted  
**Date:** 2026-05-28  
**Issue:** [#72](https://github.com/mercyJJ/cosmosvote/issues/72)

## Context

An admin could call `update_quorum(proposal_id, 1)` seconds before `finalise()` to
guarantee any proposal passes regardless of actual participation. This is a governance
manipulation vector that undermines the integrity of the voting process.

## Decision

`update_quorum` is restricted to the **first 10% of the voting period**. Calls made
after that window return `ContractError::QuorumUpdateNotAllowed`.

```
allowed window = start_time .. start_time + (duration / 10)
```

This preserves the ability to correct an accidentally misconfigured quorum early in
the vote while preventing last-minute manipulation.

## Alternatives Considered

| Option | Reason rejected |
|--------|----------------|
| Remove `update_quorum` entirely | Removes a legitimate correction mechanism |
| Allow only before any votes are cast | Easily gamed by admin voting first to lock quorum, then manipulating |
| Require a new proposal for quorum changes | High friction for minor corrections |

## Consequences

- Admins must correct quorum within the first 10% of the voting period.
- Any call outside that window is rejected with `QuorumUpdateNotAllowed`.
- The existing `votes > 0` guard is replaced by the time-lock, which is stricter
  and not bypassable by the admin.
