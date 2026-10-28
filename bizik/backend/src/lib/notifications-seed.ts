import { NotificationCategory, NotificationChannel, MessageReportSource } from '@prisma/client';

import { prisma } from './prisma';

/** Built-in notification templates, matching the transactional emails/SMS/push. */
const DEFAULT_TEMPLATES: {
  key: string;
  name: string;
  category: NotificationCategory;
  channels: NotificationChannel[];
  subject: string;
  body: string;
  variables: string[];
}[] = [
  {
    key: 'welcome_verify',
    name: 'Welcome & verify email',
    category: 'SECURITY',
    channels: ['EMAIL'],
    subject: 'Welcome to BiZik - confirm your email',
    body: 'Hi {{first_name}},\n\nWelcome to BiZik. Confirm your email to activate your account and set your home currency ({{currency}}).\n\nConfirm email → {{verify_link}}',
    variables: ['first_name', 'currency', 'verify_link'],
  },
  {
    key: 'kyc_approved',
    name: 'KYC approved',
    category: 'KYC',
    channels: ['EMAIL', 'PUSH'],
    subject: 'You’re verified on BiZik',
    body: 'Hi {{first_name}},\n\nYour identity is confirmed. You can now create projects, fund escrow and get paid on BiZik.',
    variables: ['first_name'],
  },
  {
    key: 'kyc_rejected',
    name: 'KYC rejected',
    category: 'KYC',
    channels: ['EMAIL'],
    subject: 'We couldn’t verify your identity',
    body: 'Hi {{first_name}},\n\nUnfortunately your verification didn’t pass this time. Reason: {{reason}}. You can resubmit with clearer documents.',
    variables: ['first_name', 'reason'],
  },
  {
    key: 'milestone_funded',
    name: 'Milestone funded',
    category: 'PAYMENT',
    channels: ['EMAIL', 'PUSH', 'SMS'],
    subject: 'Escrow funded - work can begin',
    body: 'Hi {{first_name}},\n\n{{actor}} funded “{{milestone}}” ({{amount}}) into escrow for {{project}}. Work can begin.',
    variables: ['first_name', 'actor', 'milestone', 'amount', 'project'],
  },
  {
    key: 'payout_sent',
    name: 'Payout sent',
    category: 'PAYMENT',
    channels: ['SMS', 'PUSH'],
    subject: 'Your payout is on its way',
    body: 'Hi {{first_name}}, your withdrawal of {{amount}} to {{method}} has been sent. Ref {{reference}}.',
    variables: ['first_name', 'amount', 'method', 'reference'],
  },
  {
    key: 'dispute_opened',
    name: 'Dispute opened',
    category: 'DISPUTE',
    channels: ['EMAIL'],
    subject: 'A dispute was opened on your project',
    body: 'Hi {{first_name}},\n\n{{actor}} opened a dispute on “{{milestone}}” ({{project}}). The funds are now frozen while it is reviewed.',
    variables: ['first_name', 'actor', 'milestone', 'project'],
  },
];

/** Upsert the built-in templates (safe to run on every boot). */
export async function seedNotificationTemplates(): Promise<void> {
  for (const template of DEFAULT_TEMPLATES) {
    await prisma.notificationTemplate.upsert({
      where: { key: template.key },
      // Only backfill copy for brand-new keys - never clobber operator edits.
      update: {},
      create: template,
    });
  }
}

/** Sample reported-message scenarios for the moderation queue (mockup parity). */
const SAMPLE_REPORTS: { body: string; reason: string; source: MessageReportSource }[] = [
  {
    body: 'This is unacceptable. You’ll regret rejecting my work - I know where your office is.',
    reason: 'Threatening message after milestone rejection - reported by recipient.',
    source: 'RECIPIENT',
  },
  {
    body: 'Let’s finish this off BiZik. Send the rest to my bank: 0123456789, GTBank. Cheaper for both of us.',
    reason: 'Attempted to move payment off-platform (shared bank details in chat).',
    source: 'RECIPIENT',
  },
  {
    body: 'You people never deliver on time, absolute clowns, I’m done being nice about it.',
    reason: 'Flagged by classifier: possible harassment. Needs human review.',
    source: 'CLASSIFIER',
  },
];

/**
 * Seed a small moderation queue in environments that have none, so the
 * Moderation tab is demonstrable. Uses real contracts (with a counterparty) and
 * creates genuine threads/messages that "Remove" can actually act on. No-op if
 * reports already exist or there is nothing to attach to.
 */
export async function seedModerationSamples(): Promise<void> {
  const existing = await prisma.messageReport.count();
  if (existing > 0) return;

  const contracts = await prisma.contract.findMany({
    where: { counterpartyId: { not: null } },
    select: { id: true, creatorId: true, counterpartyId: true },
    take: SAMPLE_REPORTS.length,
    orderBy: { createdAt: 'asc' },
  });
  if (contracts.length === 0) return;

  for (let index = 0; index < contracts.length && index < SAMPLE_REPORTS.length; index += 1) {
    const contract = contracts[index];
    const sample = SAMPLE_REPORTS[index];
    const senderId = contract.creatorId;
    const recipientId = contract.counterpartyId as string;

    const thread = await prisma.messageThread.upsert({
      where: { contractId: contract.id },
      update: {},
      create: { contractId: contract.id },
    });
    const message = await prisma.message.create({
      data: { threadId: thread.id, senderId, recipientId, body: sample.body },
    });
    await prisma.messageReport.create({
      data: {
        messageId: message.id,
        reportedById: sample.source === 'RECIPIENT' ? recipientId : null,
        reason: sample.reason,
        source: sample.source,
        status: 'PENDING',
      },
    });
  }
}
