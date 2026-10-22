import { useState, useEffect } from 'react';
import type { Proposal, ProposalState } from '../types';
import { formatTokenAmount } from '../utils';
import styles from './ProposalCard.module.css';

const STATE_COLORS: Record<ProposalState, string> = {
  Active: 'var(--color-state-active)',
  Passed: 'var(--color-state-passed)',
  Rejected: 'var(--color-state-rejected)',
  Executed: 'var(--color-state-executed)',
  Cancelled: 'var(--color-state-cancelled)',
};

interface Props {
  proposal: Proposal;
  decimals: number;
  onClick: (e?: React.MouseEvent | React.KeyboardEvent) => void;
}

function formatDate(ts: bigint): string {
  return new Date(Number(ts) * 1000).toLocaleDateString();
}

function totalVotes(p: Proposal): bigint {
  return p.votes_yes + p.votes_no + p.votes_abstain;
}

function quorumPct(p: Proposal): number {
  if (p.quorum === 0n) return 0;
  return Math.min(100, Number((totalVotes(p) * 100n) / p.quorum));
}

/**
 * Returns a human-readable countdown string for the given Unix timestamp (seconds).
 * Returns null if the timestamp is in the past (i.e. voting has ended).
 */
function getCountdown(endTimeSec: bigint): string | null {
  const nowSec = Math.floor(Date.now() / 1000);
  const diffSec = Number(endTimeSec) - nowSec;
  if (diffSec <= 0) return null;

  const days = Math.floor(diffSec / 86400);
  const hours = Math.floor((diffSec % 86400) / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (days === 0) parts.push(`${minutes}m`); // show minutes only when < 1 day
  return parts.join(' ') + ' remaining';
}

/**
 * CountdownTimer renders a live countdown for Active proposals.
 * Updates every 60 seconds and announces time remaining to screen readers via aria-live.
 */
function CountdownTimer({ endTime }: { endTime: bigint }) {
  const [countdown, setCountdown] = useState<string | null>(() => getCountdown(endTime));

  useEffect(() => {
    // Refresh immediately on mount, then every 60 s
    const tick = () => setCountdown(getCountdown(endTime));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [endTime]);

  if (countdown === null) {
    return (
      <span
        aria-live="polite"
        aria-label="Voting ended"
        style={{ color: 'var(--color-state-rejected, #dc2626)', fontWeight: 600 }}
      >
        Voting ended
      </span>
    );
  }

  return (
    <span
      aria-live="polite"
      aria-label={`Time remaining: ${countdown}`}
      title={`Voting ends ${formatDate(endTime)}`}
    >
      ⏱ {countdown}
    </span>
  );
}

export function ProposalCard({ proposal: p, decimals, onClick }: Props) {
  const color = STATE_COLORS[p.state];
  const pct = quorumPct(p);

  // Controls the 2-second copy-confirmation toast
  const [copied, setCopied] = useState(false);

  const handleCopyLink = useCallback(
    async (e: React.MouseEvent) => {
      // Prevent the card's onClick from opening the detail view
      e.stopPropagation();
      const url = buildProposalUrl(p.id);
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // Fallback: create a temporary input for environments without clipboard API
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    },
    [p.id],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(e);
    }
  };

  return (
    <article
      className="proposal-card"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Proposal #${p.id}: ${p.title}`}
      style={{
        border: `1px solid ${color}`,
        borderRadius: 8,
        padding: '1rem',
        cursor: 'pointer',
        background: 'var(--bg-card)',
        transition: 'box-shadow 0.15s, border-color 0.15s',
        outline: 'none',
        position: 'relative',
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 4px 12px ${color}44`)}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
      onFocus={e => (e.currentTarget.style.boxShadow = `0 0 0 3px ${color}44`)}
      onBlur={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>
          #{String(p.id)} — {p.title}
        </h3>

        {/* Row: state badge + copy-link button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <span
            style={{
              background: color,
              color: '#fff',
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: '0.75rem',
              whiteSpace: 'nowrap',
            }}
          >
            {p.state}
          </span>

          {/* Copy link button — Issue #30 */}
          <div style={{ position: 'relative' }}>
            <CopyToast visible={copied} />
            <button
              type="button"
              onClick={handleCopyLink}
              onKeyDown={e => {
                // Prevent card activation when pressing Enter/Space on this button
                e.stopPropagation();
              }}
              aria-label={`Copy link to proposal #${p.id}`}
              title="Copy proposal link"
              style={{
                background: 'none',
                border: '1px solid var(--border-color, #334155)',
                borderRadius: 4,
                padding: '2px 6px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                lineHeight: 1.4,
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              🔗
            </button>
          </div>
        </div>
      </div>

      <p
        style={{
          margin: '0.5rem 0',
          color: 'var(--text-secondary)',
          fontSize: '0.875rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {p.description}
      </p>

      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
        {p.state === 'Active' ? (
          <CountdownTimer endTime={p.end_time} />
        ) : (
          <>Ended {formatDate(p.end_time)}</>
        )}
        {' '}· Quorum {formatTokenAmount(p.quorum, decimals)}
      </div>

      {/* Quorum progress bar */}
      <div style={{ background: 'var(--border-color)', borderRadius: 4, height: 6 }}>
        <div
          style={{
            background: color,
            width: `${pct}%`,
            height: '100%',
            borderRadius: 4,
            transition: 'width 0.3s',
          }}
        />
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
        {pct}% of quorum · ✅ {formatTokenAmount(p.votes_yes, decimals)} · ❌{' '}
        {formatTokenAmount(p.votes_no, decimals)} · ⬜ {formatTokenAmount(p.votes_abstain, decimals)}
      </div>
    </article>
  );
}
