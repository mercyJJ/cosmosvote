import type { Proposal, VoteRecord } from '../types';
import { formatTokenAmount } from '../utils';
import { DelegationPanel } from './DelegationPanel';
import { NotificationPreferences } from './NotificationPreferences';

interface Props {
  walletAddress: string;
  tokenBalance: bigint | null;
  decimals: number;
  proposals: Proposal[];
  votedMap: Map<bigint, VoteRecord>;
  onCreateProposal: () => void;
  onDisconnect: () => void;
}

const VOTE_ICON: Record<string, string> = { Yes: '✅', No: '❌', Abstain: '⬜' };

export function UserDashboard({
  walletAddress,
  tokenBalance,
  decimals,
  proposals,
  votedMap,
  onCreateProposal,
  onDisconnect,
}: Props) {
  const active = proposals.filter(p => p.state === 'Active');
  const voted = proposals.filter(p => votedMap.has(p.id));
  const unvoted = active.filter(p => !votedMap.has(p.id));

  return (
    <aside
      aria-label="User dashboard"
      style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: '1.25rem',
        marginBottom: '1.5rem',
      }}
    >
      {/* Wallet summary */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: 2 }}>Connected wallet</div>
          <code style={{ fontSize: '0.8rem', color: '#1e293b' }}>
            {walletAddress.slice(0, 8)}…{walletAddress.slice(-6)}
          </code>
          {tokenBalance !== null && (
            <div style={{ marginTop: 4, fontWeight: 700, fontSize: '1.1rem', color: '#2563eb' }}>
              {formatTokenAmount(tokenBalance, decimals)}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={onCreateProposal}
            aria-label="Create a new proposal"
            style={{
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '0.4rem 0.75rem',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            + New Proposal
          </button>
          <button
            onClick={onDisconnect}
            aria-label="Disconnect wallet"
            style={{
              background: 'transparent',
              color: '#64748b',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              padding: '0.4rem 0.75rem',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            Disconnect
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {[
          { label: 'Active proposals', value: active.length, color: '#2563eb' },
          { label: 'You voted', value: voted.length, color: '#16a34a' },
          { label: 'Awaiting your vote', value: unvoted.length, color: '#d97706' },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              flex: '1 1 100px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: '0.5rem 0.75rem',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Voted items */}
      {voted.length > 0 && (
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.4rem' }}>
            Your votes
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {voted.slice(0, 5).map(p => {
              const record = votedMap.get(p.id);
              return (
                <li
                  key={String(p.id)}
                  style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#374151' }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                    #{String(p.id)} {p.title}
                  </span>
                  <span>{record ? VOTE_ICON[record.vote] : ''} {record?.vote}</span>
                </li>
              );
            })}
            {voted.length > 5 && (
              <li style={{ fontSize: '0.75rem', color: '#94a3b8' }}>+{voted.length - 5} more</li>
            )}
          </ul>
        </div>
      )}

      {/* Nudge to vote on active proposals */}
      {unvoted.length > 0 && (
        <div
          role="note"
          style={{
            marginTop: '0.75rem',
            padding: '0.5rem 0.75rem',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 6,
            fontSize: '0.78rem',
            color: '#92400e',
          }}
        >
          🔔 You have {unvoted.length} active proposal{unvoted.length > 1 ? 's' : ''} you haven't voted on yet.
        </div>
      )}

      {/* Delegation management */}
      <DelegationPanel walletAddress={walletAddress} />

      {/* Notification preferences */}
      <NotificationPreferences walletAddress={walletAddress} />
    </aside>
  );
}
