/**
 * MyVotes — voter history section for UserDashboard.
 *
 * Shows all proposals a connected wallet has voted on, with:
 *  - Proposal title and ID
 *  - Vote cast (Yes / No / Abstain) with icon
 *  - Vote weight used
 *  - Final proposal outcome (state)
 *  - Filter by outcome (All / Passed / Rejected / Active / Executed / Cancelled)
 *  - Empty state when no votes exist
 *  - Loading skeleton while data is fetching
 *
 * Issue #260
 */
import { useState } from 'react';
import type { Proposal, VoteRecord, ProposalState } from '../types';
import { formatTokenAmount } from '../utils';
import styles from './MyVotes.module.css';
import skeletonStyles from './ProposalSkeleton.module.css';

interface MyVotesProps {
  /** All proposals fetched from the chain. */
  proposals: Proposal[];
  /** Map of proposalId → VoteRecord for the connected wallet. */
  votedMap: Map<bigint, VoteRecord>;
  /** Token decimals for formatting weight. */
  decimals: number;
  /** True while vote history data is being fetched. */
  loading: boolean;
}

const VOTE_ICON: Record<string, string> = {
  Yes: '✅',
  No: '❌',
  Abstain: '⬜',
};

const STATE_BADGE_COLOR: Record<ProposalState, string> = {
  Active: '#2563eb',
  Passed: '#16a34a',
  Rejected: '#dc2626',
  Executed: '#7c3aed',
  Cancelled: '#6b7280',
};

type OutcomeFilter = 'All' | ProposalState;
const OUTCOME_FILTERS: OutcomeFilter[] = ['All', 'Active', 'Passed', 'Rejected', 'Executed', 'Cancelled'];

/** Skeleton row shown while loading. */
function MyVotesSkeleton() {
  return (
    <div
      className={styles.skeletonContainer}
      aria-busy="true"
      aria-label="Loading vote history…"
    >
      {[0, 1, 2].map(i => (
        <div key={i} className={styles.skeletonRow} aria-hidden="true">
          <div className={`${skeletonStyles.skeleton} ${styles.skeletonTitle}`} />
          <div className={`${skeletonStyles.skeleton} ${styles.skeletonVote}`} />
          <div className={`${skeletonStyles.skeleton} ${styles.skeletonWeight}`} />
          <div className={`${skeletonStyles.skeleton} ${styles.skeletonBadge}`} />
        </div>
      ))}
    </div>
  );
}

export function MyVotes({ proposals, votedMap, decimals, loading }: MyVotesProps) {
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('All');

  // Build the list of voted proposals with their VoteRecord attached
  const votedProposals = proposals
    .filter(p => votedMap.has(p.id))
    .map(p => ({ proposal: p, record: votedMap.get(p.id)! }));

  // Apply outcome filter
  const filtered =
    outcomeFilter === 'All'
      ? votedProposals
      : votedProposals.filter(({ proposal }) => proposal.state === outcomeFilter);

  return (
    <section aria-labelledby="my-votes-heading" className={styles.container}>
      <div className={styles.header}>
        <h3 id="my-votes-heading" className={styles.heading}>
          🗳️ My Votes
        </h3>
        {/* Filter by outcome */}
        <div className={styles.filterRow} role="group" aria-label="Filter votes by outcome">
          {OUTCOME_FILTERS.map(f => (
            <button
              key={f}
              className={`${styles.filterBtn} ${outcomeFilter === f ? styles.filterBtnActive : ''}`}
              onClick={() => setOutcomeFilter(f)}
              aria-pressed={outcomeFilter === f}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && <MyVotesSkeleton />}

      {/* Empty state */}
      {!loading && votedProposals.length === 0 && (
        <div className={styles.emptyState} role="status">
          <span className={styles.emptyIcon}>📭</span>
          <p>You haven't voted on any proposals yet.</p>
        </div>
      )}

      {/* No results for current filter */}
      {!loading && votedProposals.length > 0 && filtered.length === 0 && (
        <div className={styles.emptyState} role="status">
          <span className={styles.emptyIcon}>🔍</span>
          <p>No votes match the <strong>{outcomeFilter}</strong> filter.</p>
        </div>
      )}

      {/* Vote rows */}
      {!loading && filtered.length > 0 && (
        <ul className={styles.list} aria-label="Voted proposals">
          {filtered.map(({ proposal: p, record }) => (
            <li key={String(p.id)} className={styles.row}>
              {/* Title + ID */}
              <div className={styles.titleCell}>
                <span className={styles.proposalId}>#{String(p.id)}</span>
                <span className={styles.proposalTitle}>{p.title}</span>
              </div>

              {/* Vote cast */}
              <div className={styles.voteCell} aria-label={`Vote: ${record.vote}`}>
                <span className={styles.voteIcon}>{VOTE_ICON[record.vote]}</span>
                <span className={styles.voteLabel}>{record.vote}</span>
              </div>

              {/* Weight used */}
              <div className={styles.weightCell} aria-label={`Weight: ${formatTokenAmount(record.weight, decimals)}`}>
                {formatTokenAmount(record.weight, decimals)}
              </div>

              {/* Outcome badge */}
              <div
                className={styles.badgeCell}
                style={{ '--badge-color': STATE_BADGE_COLOR[p.state] } as React.CSSProperties}
                aria-label={`Outcome: ${p.state}`}
              >
                <span className={styles.badge}>{p.state}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Total count */}
      {!loading && votedProposals.length > 0 && (
        <p className={styles.totalCount}>
          Showing {filtered.length} of {votedProposals.length} vote{votedProposals.length !== 1 ? 's' : ''}
        </p>
      )}
    </section>
  );
}
