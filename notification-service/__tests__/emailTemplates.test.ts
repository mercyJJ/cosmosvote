import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderEmailNotification } from '../src/emailTemplates';
import type { GovernanceEvent, GovernanceEventType } from '../src/types';

function event(type: GovernanceEventType, raw: unknown = {}): GovernanceEvent {
  return { type, proposalId: '42', ledger: 123, raw };
}

test('renders HTML and plain-text versions for the three proposal email events', () => {
  const previousTemplate = process.env.PROPOSAL_URL_TEMPLATE;
  process.env.PROPOSAL_URL_TEMPLATE = 'https://vote.example/proposals/{id}';

  try {
    const cases: Array<[GovernanceEventType, string]> = [
      ['created', 'Proposal created'],
      ['final', 'Voting ended'],
      ['exec', 'Proposal executed'],
    ];

    for (const [type, heading] of cases) {
      const rendered = renderEmailNotification(event(type, { title: 'Community budget', result: 'Passed' }));
      assert.match(rendered.html, new RegExp(heading));
      assert.match(rendered.html, /Community budget/);
      assert.match(rendered.html, /href="https:\/\/vote\.example\/proposals\/42"/);
      assert.match(rendered.text, /Community budget/);
      assert.match(rendered.text, /https:\/\/vote\.example\/proposals\/42/);
      assert.match(rendered.text, /Ledger 123/);
    }
  } finally {
    if (previousTemplate === undefined) delete process.env.PROPOSAL_URL_TEMPLATE;
    else process.env.PROPOSAL_URL_TEMPLATE = previousTemplate;
  }
});

test('escapes proposal data in HTML and omits invalid proposal links', () => {
  const rendered = renderEmailNotification(event('created', { title: '<img src=x onerror=alert(1)>' }));

  assert.match(rendered.html, /&lt;img src&#x3D;x onerror&#x3D;alert\(1\)&gt;/);
  assert.doesNotMatch(rendered.html, /<img src=x/);
  assert.doesNotMatch(rendered.html, /href=/);
  assert.match(rendered.text, /<img src=x onerror=alert\(1\)>/);
});