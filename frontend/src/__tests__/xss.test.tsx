import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ProposalCard } from '../components/ProposalCard';
import { ProposalDetail } from '../components/ProposalDetail';
import type { Proposal } from '../types';

const sampleProposal = (title: string, description = 'desc', discussion_url?: string): Proposal => ({
  id: 1n,
  proposer: 'GABC',
  title,
  description,
  votes_yes: 0n,
  votes_no: 0n,
  votes_abstain: 0n,
  quorum: 1000n,
  start_time: 0n,
  end_time: 0n,
  state: 'Active',
  discussion_url,
} as Proposal);

/**
 * Issue #115 — XSS injection vectors for proposal title/description rendering.
 *
 * Neither ProposalCard nor ProposalDetail uses dangerouslySetInnerHTML:
 * titles and descriptions are rendered as plain React text nodes, so React's
 * built-in escaping is what actually protects these components. These tests
 * exercise five classic XSS payload shapes end-to-end through both
 * components and additionally guard against a future regression that would
 * introduce dangerouslySetInnerHTML.
 */
describe('XSS protection for proposal rendering', () => {
  const vectors: Array<{ name: string; payload: string }> = [
    { name: 'script tag', payload: '<script>alert("xss")</script>' },
    { name: 'img onerror attribute', payload: '<img src=x onerror="alert(1)">' },
    { name: 'javascript: URL', payload: 'javascript:alert(1)' },
    { name: 'svg onload', payload: '<svg onload="alert(1)"></svg>' },
    { name: 'HTML entity encoded script', payload: '&lt;script&gt;alert(1)&lt;/script&gt;' },
  ];

  describe('ProposalCard', () => {
    for (const { name, payload } of vectors) {
      it(`does not execute or render markup for: ${name}`, () => {
        const { container } = render(
          <ProposalCard proposal={sampleProposal(payload)} decimals={2} onClick={() => {}} />,
        );
        expect(container.querySelector('script')).toBeNull();
        expect(container.querySelector('svg')).toBeNull();
        expect(container.querySelector('img')).toBeNull();
        // Content is shown literally as text, not parsed as HTML.
        expect(container.textContent).toContain(payload);
      });
    }

    it('never uses dangerouslySetInnerHTML for proposal content', () => {
      const payload = '<b>bold</b>';
      const { container } = render(
        <ProposalCard proposal={sampleProposal(payload)} decimals={2} onClick={() => {}} />,
      );
      // If this ever renders as real markup, <b> would be a real DOM element.
      expect(container.querySelector('b')).toBeNull();
      expect(container.textContent).toContain('<b>bold</b>');
    });
  });

  describe('ProposalDetail', () => {
    const noop = () => {};

    for (const { name, payload } of vectors) {
      it(`does not execute or render markup for: ${name}`, () => {
        const { container } = render(
          <ProposalDetail
            proposal={sampleProposal(payload, payload)}
            decimals={2}
            walletAddress={null}
            onClose={noop}
          />,
        );
        expect(container.querySelector('script')).toBeNull();
        expect(container.querySelector('svg')).toBeNull();
        expect(container.querySelector('img')).toBeNull();
      });
    }

    it('only links discussion_url when it is an https:// URL (javascript: URL rejected)', () => {
      const { container } = render(
        <ProposalDetail
          proposal={sampleProposal('title', 'desc', 'javascript:alert(1)')}
          decimals={2}
          walletAddress={null}
          onClose={noop}
        />,
      );
      const link = container.querySelector('a[target="_blank"]');
      expect(link).toBeNull();
    });

    it('renders a valid https discussion_url as a real link', () => {
      const { container } = render(
        <ProposalDetail
          proposal={sampleProposal('title', 'desc', 'https://forum.example.com/t/1')}
          decimals={2}
          walletAddress={null}
          onClose={noop}
        />,
      );
      const link = container.querySelector('a[href="https://forum.example.com/t/1"]');
      expect(link).not.toBeNull();
    });
  });
});
