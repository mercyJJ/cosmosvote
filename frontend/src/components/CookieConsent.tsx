/**
 * CookieConsent – Issue #32
 *
 * Cookie consent banner that appears on first visit.
 * The user's preference is persisted in localStorage and respected by analytics.ts.
 */

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'analytics_consent';

export type ConsentState = 'accepted' | 'rejected' | null;

/** Read the stored consent value without side effects. */
export function getStoredConsent(): ConsentState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'accepted' || raw === 'rejected') return raw;
  } catch {
    // localStorage unavailable
  }
  return null;
}

/** Persist a consent decision. */
export function setStoredConsent(value: 'accepted' | 'rejected'): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // storage unavailable — operate in-memory only
  }
}

interface CookieConsentProps {
  /** Called after the user makes a decision. */
  onDecision?: (accepted: boolean) => void;
}

/**
 * Renders a cookie consent banner if no prior decision has been stored.
 * Once the user accepts or rejects, the banner disappears and the decision is persisted.
 */
export function CookieConsent({ onDecision }: CookieConsentProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show if no decision has been recorded yet
    if (getStoredConsent() === null) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  function handleDecision(accepted: boolean) {
    const value = accepted ? 'accepted' : 'rejected';
    setStoredConsent(value);
    setVisible(false);
    onDecision?.(accepted);
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Cookie consent"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'var(--bg-card, #1e293b)',
        color: 'var(--text-primary, #f1f5f9)',
        borderTop: '1px solid var(--border-color, #334155)',
        padding: '1rem 2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        zIndex: 2000,
        boxShadow: '0 -4px 16px rgba(0,0,0,0.2)',
      }}
    >
      <div style={{ flex: 1, minWidth: 240, fontSize: '0.875rem', lineHeight: 1.5 }}>
        <strong>We value your privacy.</strong>{' '}
        CosmosVote uses anonymous, privacy-preserving analytics to improve the app.
        No personal data or wallet addresses are collected. You can opt out at any time.{' '}
        <a
          href="/docs/analytics-policy.md"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#60a5fa', textDecoration: 'underline' }}
        >
          Learn more
        </a>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexShrink: 0 }}>
        <button
          onClick={() => handleDecision(false)}
          aria-label="Reject analytics cookies"
          style={{
            background: 'none',
            border: '1px solid #64748b',
            color: 'var(--text-primary, #f1f5f9)',
            borderRadius: 6,
            padding: '0.5rem 1.25rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          Reject
        </button>
        <button
          onClick={() => handleDecision(true)}
          aria-label="Accept analytics cookies"
          style={{
            background: '#3b82f6',
            border: 'none',
            color: '#fff',
            borderRadius: 6,
            padding: '0.5rem 1.25rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          Accept
        </button>
      </div>
    </div>
  );
}
