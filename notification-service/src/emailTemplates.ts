import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import type { GovernanceEvent } from './types';

export interface RenderedEmail {
  html: string;
  text: string;
}

type TemplateName = 'proposal-created' | 'voting-ended' | 'proposal-executed' | 'notification';

interface EmailData {
  title: string;
  proposalId: string;
  proposalLink?: string;
  eventName: string;
  result: string;
  ledger: number;
}

function loadTemplate(name: string, noEscape = false): HandlebarsTemplateDelegate<EmailData> {
  const file = path.join(__dirname, 'templates', name);
  return Handlebars.compile(fs.readFileSync(file, 'utf8'), { noEscape });
}

const htmlTemplates: Record<TemplateName, HandlebarsTemplateDelegate<EmailData>> = {
  'proposal-created': loadTemplate('proposal-created.html.hbs'),
  'voting-ended': loadTemplate('voting-ended.html.hbs'),
  'proposal-executed': loadTemplate('proposal-executed.html.hbs'),
  notification: loadTemplate('notification.html.hbs'),
};
const textTemplate = loadTemplate('notification.txt.hbs', true);

function rawString(raw: unknown, keys: string[]): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' || typeof value === 'number') return String(value);
  }
  return undefined;
}

function proposalLink(proposalId?: string): string | undefined {
  const template = process.env.PROPOSAL_URL_TEMPLATE;
  if (!template || !proposalId) return undefined;

  const candidate = template.replace(/\{id\}/g, encodeURIComponent(proposalId));
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function emailData(event: GovernanceEvent): EmailData {
  const eventNames: Record<string, string> = {
    created: 'Proposal created',
    voted: 'Vote recorded',
    final: 'Voting ended',
    exec: 'Proposal executed',
    cancel: 'Proposal cancelled',
  };
  const results: Record<string, string> = {
    created: 'A new proposal is available for voting.',
    final: 'Voting has ended for this proposal.',
    exec: 'This proposal has been executed.',
  };
  const proposalId = event.proposalId ?? '';

  return {
    title: rawString(event.raw, ['title', 'proposalTitle', 'name']) ??
      (proposalId ? `Proposal #${proposalId}` : 'Governance proposal'),
    proposalId,
    proposalLink: proposalLink(event.proposalId),
    eventName: eventNames[event.type] ?? 'Governance update',
    result: rawString(event.raw, ['result', 'outcome']) ??
      results[event.type] ?? 'There is a new governance update.',
    ledger: event.ledger,
  };
}

function templateName(event: GovernanceEvent): TemplateName {
  if (event.type === 'created') return 'proposal-created';
  if (event.type === 'final') return 'voting-ended';
  if (event.type === 'exec') return 'proposal-executed';
  return 'notification';
}

export function renderEmailNotification(event: GovernanceEvent): RenderedEmail {
  const data = emailData(event);
  return {
    html: htmlTemplates[templateName(event)](data),
    text: textTemplate(data),
  };
}