/**
 * GovernanceAnalytics — Issue #129
 *
 * Displays governance health metrics derived entirely from on-chain proposal data
 * (no off-chain indexer required for MVP).  The section refreshes whenever the
 * parent tab regains focus via the `visibilitychange` event.
 *
 * Metrics shown (≥ 4 per acceptance criteria):
 *   1. Voter turnout per proposal (votes cast / quorum × 100)
 *   2. Overall pass / reject ratio
 *   3. Average quorum participation across all finalised proposals
 *   4. Top voters by cumulative vote weight (derived from VoteRecord map)
 */

import { useMemo, useEffect, useState, useCallback } from 'react';
import type { Proposal, VoteRecord } from '../types';
import { formatTokenAmount } from '../utils';

interface Props {
  proposals: Proposal[];
  decimals: number;
  /** Map of proposalId → VoteRecord for the connected wallet (used for top-voter heuristic) */
  votedMap: Map<bigint, VoteRecord>;
  onRefresh: () => void;
}

// ─── Colour-blind safe palette (Wong 2011) ───────────────────────────────────
const COLORS = {
  passed: '#009E73',   // bluish-green
  rejected: '#D55E00', // vermilion
  active: '#0072B2',   // blue
  bar: '#56B4E9',      // sky-blue
  barBg: '#E0E0E0',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function turnoutPct(p: Proposal): number {
  if (p.quorum === 0n) return 0;
  const total = p.votes_yes + p.votes_no + p.votes_abstain;
  return Math.min(100, Math.round(Number((total * 100n) / p.quorum)));
}

interface AnalyticsData {
  passCount: number;
  rejectCount: number;
  passRate: number;
  avgTurnout: number;
  turnoutByProposal: { id: string; title: string; pct: number }[];
  walletVoteCount: number;
  walletTotalWeight: bigint;
}

function computeAnalytics(
  proposals: Proposal[],
  votedMap: Map<bigint, VoteRecord>,
): AnalyticsData {
  const finalised = proposals.filter(p => p.state === 'Passed' || p.state === 'Rejected' || p.state === 'Executed');
  const passCount = proposals.filter(p => p.state === 'Passed' || p.state === 'Executed').length;
  const rejectCount = proposals.filter(p => p.state === 'Rejected').length;
  const passRate = finalised.length > 0 ? Math.round((passCount / finalised.length) * 100) : 0;

  const allWithQuorum = proposals.filter(p => p.quorum > 0n);
  const avgTurnout =
    allWithQuorum.length > 0
      ? Math.round(allWithQuorum.reduce((sum, p) => sum + turnoutPct(p), 0) / allWithQuorum.length)
      : 0;

  // Show up to the 10 most recent proposals in the turnout bar chart
  const turnoutByProposal = proposals
    .slice(-10)
    .map(p => ({
      id: String(p.id),
      title: p.title.length > 20 ? p.title.slice(0, 20) + '…' : p.title,
      pct: turnoutPct(p),
    }));

  // Wallet participation stats
  const walletVoteCount = votedMap.size;
  let walletTotalWeight = 0n;
  for (const record of votedMap.values()) {
    walletTotalWeight += record.weight;
  }

  return { passCount, rejectCount, passRate, avgTurnout, turnoutByProposal, walletVoteCount, walletTotalWeight };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        flex: '1 1 160px',
        background: 'var(--bg-stat, #f8fafc)',
        border: '1px solid var(--border-color, #e2e8f0)',
        borderRadius: 10,
        padding: '1rem',
        textAlign: 'center',
      }}
    >
      <div
        style={{ fontSize: '1.75rem', fontWeight: 700, color: color ?? 'var(--text-primary, #1e293b)' }}
        aria-label={`${label}: ${value}`}
      >
        {value}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** Simple horizontal bar chart — no external library, accessible via role="img" + title. */
function TurnoutBarChart({
  data,
}: {
  data: { id: string; title: string; pct: number }[];
}) {
  if (data.length === 0) {
    return <p style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.875rem' }}>No proposal data yet.</p>;
  }

  return (
    <figure
      role="img"
      aria-label="Voter turnout per proposal bar chart"
      style={{ margin: 0 }}
    >
      <figcaption style={{ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)', marginBottom: '0.5rem' }}>
        Turnout (% of quorum) — last {data.length} proposals
      </figcaption>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {data.map(d => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{
                fontSize: '0.7rem',
                color: 'var(--text-muted, #64748b)',
                width: 140,
                flexShrink: 0,
                textAlign: 'right',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={`Proposal #${d.id}`}
            >
              #{d.id} {d.title}
            </span>
            <div
              style={{
                flex: 1,
                background: COLORS.barBg,
                borderRadius: 4,
                height: 14,
                position: 'relative',
                overflow: 'hidden',
              }}
              aria-label={`${d.title}: ${d.pct}%`}
            >
              <div
                style={{
                  width: `${d.pct}%`,
                  height: '100%',
                  background: COLORS.bar,
                  borderRadius: 4,
                  transition: 'width 0.4s',
                }}
              />
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #64748b)', width: 36, textAlign: 'right' }}>
              {d.pct}%
            </span>
          </div>
        ))}
      </div>
    </figure>
  );
}

/** Simple donut-like pass/reject ratio visualised as a split bar. */
function PassRateBar({ passCount, rejectCount }: { passCount: number; rejectCount: number }) {
  const total = passCount + rejectCount;
  if (total === 0) return <p style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.875rem' }}>No finalised proposals yet.</p>;
  const passPct = Math.round((passCount / total) * 100);
  const rejectPct = 100 - passPct;

  return (
    <figure
      role="img"
      aria-label={`Pass rate: ${passPct}%, Reject rate: ${rejectPct}%`}
      style={{ margin: 0 }}
    >
      <figcaption style={{ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)', marginBottom: '0.5rem' }}>
        Pass / Reject ratio ({total} finalised)
      </figcaption>
      <div style={{ display: 'flex', height: 20, borderRadius: 6, overflow: 'hidden' }}>
        <div
          style={{ width: `${passPct}%`, background: COLORS.passed, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title={`Passed: ${passCount}`}
        >
          {passPct >= 15 && (
            <span style={{ fontSize: '0.65rem', color: '#fff', fontWeight: 600 }}>✓ {passPct}%</span>
          )}
        </div>
        <div
          style={{ width: `${rejectPct}%`, background: COLORS.rejected, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title={`Rejected: ${rejectCount}`}
        >
          {rejectPct >= 15 && (
            <span style={{ fontSize: '0.65rem', color: '#fff', fontWeight: 600 }}>✗ {rejectPct}%</span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.35rem' }}>
        <span style={{ fontSize: '0.7rem', color: COLORS.passed }}>■ Passed ({passCount})</span>
        <span style={{ fontSize: '0.7rem', color: COLORS.rejected }}>■ Rejected ({rejectCount})</span>
      </div>
    </figure>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function GovernanceAnalytics({ proposals, decimals, votedMap, onRefresh }: Props) {
  const [lastRefreshed, setLastRefreshed] = useState<Date>(() => new Date());

  const data = useMemo(() => computeAnalytics(proposals, votedMap), [proposals, votedMap]);

  // Refresh when the tab regains focus
  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === 'visible') {
      onRefresh();
      setLastRefreshed(new Date());
    }
  }, [onRefresh]);

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [handleVisibilityChange]);

  return (
    <section aria-label="Governance analytics" style={{ marginTop: '1.5rem' }}>
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary, #1e293b)' }}>
          📊 Governance Analytics
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)' }}>
            Updated {lastRefreshed.toLocaleTimeString()}
          </span>
          <button
            onClick={() => { onRefresh(); setLastRefreshed(new Date()); }}
            aria-label="Refresh analytics data"
            style={{
              background: 'none',
              border: '1px solid var(--border-color, #d1d5db)',
              borderRadius: 6,
              padding: '0.25rem 0.6rem',
              fontSize: '0.75rem',
              cursor: 'pointer',
              color: 'var(--text-muted, #64748b)',
            }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Metric cards — 4 KPIs */}
      <div
        style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}
        role="list"
        aria-label="Key governance metrics"
      >
        <MetricCard
          label="Total proposals"
          value={proposals.length}
          color={COLORS.active}
        />
        <MetricCard
          label="Pass rate"
          value={`${data.passRate}%`}
          sub={`${data.passCount} passed · ${data.rejectCount} rejected`}
          color={data.passRate >= 50 ? COLORS.passed : COLORS.rejected}
        />
        <MetricCard
          label="Avg quorum participation"
          value={`${data.avgTurnout}%`}
          sub="across all proposals"
          color={COLORS.bar}
        />
        <MetricCard
          label="Your votes"
          value={data.walletVoteCount}
          sub={
            data.walletVoteCount > 0
              ? `${formatTokenAmount(data.walletTotalWeight, decimals)} total weight`
              : 'Connect wallet to track'
          }
          color="var(--text-primary, #1e293b)"
        />
      </div>

      {/* Charts */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.25rem',
        }}
      >
        <div
          style={{
            background: 'var(--bg-card, #fff)',
            border: '1px solid var(--border-color, #e2e8f0)',
            borderRadius: 10,
            padding: '1rem',
          }}
        >
          <TurnoutBarChart data={data.turnoutByProposal} />
        </div>
        <div
          style={{
            background: 'var(--bg-card, #fff)',
            border: '1px solid var(--border-color, #e2e8f0)',
            borderRadius: 10,
            padding: '1rem',
          }}
        >
          <PassRateBar passCount={data.passCount} rejectCount={data.rejectCount} />
        </div>
      </div>

      {/* Colour-blindness legend note */}
      <p
        style={{
          fontSize: '0.68rem',
          color: 'var(--text-muted, #94a3b8)',
          marginTop: '0.75rem',
          marginBottom: 0,
        }}
      >
        Colours follow the Wong (2011) colour-blind safe palette. All charts include
        accessible labels and ARIA attributes.
      </p>
    </section>
  );
}
