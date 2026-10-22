/**
 * NotificationPreferences — Issue #130
 *
 * Lets connected users configure which governance events they want to be
 * notified about.  Preferences are persisted in localStorage (keyed per
 * wallet address) AND synced to the notification-service subscription API
 * whenever a toggle changes.
 *
 * Supported events:
 *   - proposal_created   — a new proposal has been submitted
 *   - voting_ending_soon — voting closes within 24 hours
 *   - result_announced   — a proposal has been finalised (Passed / Rejected)
 */

import { useState, useEffect, useCallback } from 'react';
import { config } from '../config';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotificationPrefs {
  proposal_created: boolean;
  voting_ending_soon: boolean;
  result_announced: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  proposal_created: false,
  voting_ending_soon: false,
  result_announced: false,
};

const PREF_LABELS: Record<keyof NotificationPrefs, string> = {
  proposal_created: 'New proposal submitted',
  voting_ending_soon: 'Voting ending soon (< 24 h)',
  result_announced: 'Result announced',
};

// ─── Storage helpers ──────────────────────────────────────────────────────────

function prefsKey(walletAddress: string): string {
  return `cosmosvote:notification_prefs:${walletAddress}`;
}

function loadPrefs(walletAddress: string): NotificationPrefs {
  try {
    const raw = localStorage.getItem(prefsKey(walletAddress));
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) } as NotificationPrefs;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(walletAddress: string, prefs: NotificationPrefs): void {
  try {
    localStorage.setItem(prefsKey(walletAddress), JSON.stringify(prefs));
  } catch {
    // Storage unavailable — silently ignore
  }
}

// ─── Notification service API ─────────────────────────────────────────────────

/**
 * Calls the notification-service subscription endpoint.
 *
 * POST /subscribe   { address, events[] }  → subscribe to listed events
 * DELETE /subscribe { address }            → unsubscribe from all
 *
 * This is a best-effort call; UI feedback is shown but a failure does not
 * block the local preference update.
 */
async function syncSubscription(
  walletAddress: string,
  prefs: NotificationPrefs,
): Promise<void> {
  const activeEvents = (Object.keys(prefs) as (keyof NotificationPrefs)[]).filter(k => prefs[k]);

  const notifBaseUrl = (config as Record<string, unknown>).notificationServiceUrl as string | undefined
    ?? import.meta.env.VITE_NOTIFICATION_SERVICE_URL
    ?? '/api/notifications';

  if (activeEvents.length === 0) {
    // Unsubscribe all
    await fetch(`${notifBaseUrl}/subscribe`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: walletAddress }),
    });
  } else {
    await fetch(`${notifBaseUrl}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: walletAddress, events: activeEvents }),
    });
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  walletAddress: string;
}

type SyncState = 'idle' | 'syncing' | 'ok' | 'error';

export function NotificationPreferences({ walletAddress }: Props) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => loadPrefs(walletAddress));
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [expanded, setExpanded] = useState(false);

  // Reload prefs if the wallet changes
  useEffect(() => {
    setPrefs(loadPrefs(walletAddress));
    setSyncState('idle');
  }, [walletAddress]);

  const handleToggle = useCallback(
    async (event: keyof NotificationPrefs) => {
      const next: NotificationPrefs = { ...prefs, [event]: !prefs[event] };
      setPrefs(next);
      savePrefs(walletAddress, next);

      setSyncState('syncing');
      try {
        await syncSubscription(walletAddress, next);
        setSyncState('ok');
      } catch {
        setSyncState('error');
      }
    },
    [prefs, walletAddress],
  );

  const handleUnsubscribeAll = useCallback(async () => {
    const next = { ...DEFAULT_PREFS };
    setPrefs(next);
    savePrefs(walletAddress, next);
    setSyncState('syncing');
    try {
      await syncSubscription(walletAddress, next);
      setSyncState('ok');
    } catch {
      setSyncState('error');
    }
  }, [walletAddress]);

  const hasAny = Object.values(prefs).some(Boolean);

  return (
    <section
      aria-label="Notification preferences"
      style={{
        marginTop: '0.75rem',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {/* Header / toggle */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        aria-controls="notif-prefs-body"
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.6rem 0.85rem',
          background: '#f8fafc',
          border: 'none',
          cursor: 'pointer',
          fontSize: '0.82rem',
          fontWeight: 600,
          color: '#374151',
          textAlign: 'left',
        }}
      >
        <span>🔔 Notifications {hasAny && <span style={{ color: '#2563eb' }}>({Object.values(prefs).filter(Boolean).length} active)</span>}</span>
        <span aria-hidden="true">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div
          id="notif-prefs-body"
          style={{ padding: '0.75rem 0.85rem', background: '#fff' }}
        >
          {/* Sync status */}
          {syncState === 'syncing' && (
            <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '0 0 0.5rem' }} aria-live="polite">
              ⏳ Saving preferences…
            </p>
          )}
          {syncState === 'ok' && (
            <p style={{ fontSize: '0.72rem', color: '#16a34a', margin: '0 0 0.5rem' }} aria-live="polite">
              ✅ Preferences saved
            </p>
          )}
          {syncState === 'error' && (
            <p style={{ fontSize: '0.72rem', color: '#dc2626', margin: '0 0 0.5rem' }} role="alert">
              ⚠️ Could not sync to server — preferences saved locally
            </p>
          )}

          {/* Toggle list */}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            {(Object.keys(prefs) as (keyof NotificationPrefs)[]).map(event => (
              <li key={event} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label
                  htmlFor={`notif-${event}`}
                  style={{ fontSize: '0.8rem', color: '#374151', cursor: 'pointer', flex: 1 }}
                >
                  {PREF_LABELS[event]}
                </label>
                {/* Custom accessible toggle */}
                <button
                  id={`notif-${event}`}
                  type="button"
                  role="switch"
                  aria-checked={prefs[event]}
                  aria-label={`${PREF_LABELS[event]} notifications ${prefs[event] ? 'on' : 'off'}`}
                  onClick={() => handleToggle(event)}
                  style={{
                    width: 40,
                    height: 22,
                    borderRadius: 11,
                    border: 'none',
                    background: prefs[event] ? '#2563eb' : '#d1d5db',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'background 0.2s',
                    flexShrink: 0,
                    padding: 0,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      top: 3,
                      left: prefs[event] ? 21 : 3,
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: '#fff',
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }}
                  />
                </button>
              </li>
            ))}
          </ul>

          {/* Unsubscribe all */}
          {hasAny && (
            <button
              type="button"
              onClick={handleUnsubscribeAll}
              style={{
                marginTop: '0.75rem',
                background: 'none',
                color: '#dc2626',
                border: '1px solid #fca5a5',
                borderRadius: 5,
                padding: '0.3rem 0.7rem',
                fontSize: '0.75rem',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              Unsubscribe from all notifications
            </button>
          )}
        </div>
      )}
    </section>
  );
}
