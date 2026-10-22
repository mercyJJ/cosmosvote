// Governance contract types mirroring the Rust contract

export type ProposalState = 'Active' | 'Passed' | 'Rejected' | 'Executed' | 'Cancelled';
export type VoteType = 'Yes' | 'No' | 'Abstain';

export interface Proposal {
  id: bigint;
  proposer: string;
  title: string;
  description: string;
  cancellation_reason?: string | null;
  /** Off-chain discussion link (e.g. forum thread). Must be HTTPS when present. */
  discussion_url?: string | null;
  votes_yes: bigint;
  votes_no: bigint;
  votes_abstain: bigint;
  quorum: bigint;
  start_time: bigint;
  end_time: bigint;
  state: ProposalState;
  /**
   * Optional named choices for multi-choice proposals.
   * When non-empty, the frontend renders a choice list instead of the
   * standard Yes / No / Abstain buttons, and submits Vote::Choice(index)
   * to the contract.
   *
   * Issue #14: Add multi-choice proposal voting UI.
   */
  choices?: string[];
}

export interface VoteRecord {
  vote: VoteType;
  weight: bigint;
}

export interface NetworkConfig {
  rpcUrl: string;
  networkPassphrase: string;
  governanceContractId: string;
  tokenContractId: string;
  treasuryContractId: string;
}

// Treasury types
export type TreasuryProposalType = 'Transfer' | 'Allocation' | 'Spend' | 'Freeze';

export interface TreasuryInfo {
  contractId: string;
  balance: bigint;
  pendingTransfers: number;
  isActive: boolean;
}

export interface TreasuryProposal {
  proposal: Proposal;
  treasuryType: TreasuryProposalType;
  targetAddress: string;
  amount: bigint;
}

export interface VoteHistoryEntry {
  proposalId: bigint;
  proposalTitle: string;
  vote: VoteType;
  weight: bigint;
  timestamp: bigint;
}

// --- Comment / Annotation System (Issue #387) ---

export interface ProposalComment {
  id: string;
  proposalId: bigint;
  author: string;
  content: string;
  timestamp: number;
  txHash?: string;
}

/** Comments grouped by proposalId (stringified bigint key). */
export type CommentsStore = Record<string, ProposalComment[]>;