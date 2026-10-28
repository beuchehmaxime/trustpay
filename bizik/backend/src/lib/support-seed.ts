import { SupportCategory, SupportPriority, SupportTicketStatus } from '@prisma/client';

import { prisma } from './prisma';

const HELP_ARTICLES: {
  category: string;
  title: string;
  slug: string;
  body: string;
  order: number;
}[] = [
  {
    category: 'Getting started',
    title: 'How BiZik protects your payments',
    slug: 'how-escrow-works',
    body: 'When a client funds a milestone, the money is held safely in escrow. It is only released to the freelancer once the work is approved - or refunded to the client under the agreed terms. Neither side can move the funds unilaterally.',
    order: 1,
  },
  {
    category: 'Verification',
    title: 'Verifying your identity (KYC)',
    slug: 'verifying-your-identity',
    body: 'To create projects and get paid you must verify your identity. Have a clear photo of your government ID and a selfie ready. Most checks complete within a minute; some are routed to our team for a closer look.',
    order: 2,
  },
  {
    category: 'Payments',
    title: 'Withdrawing your funds',
    slug: 'withdrawing-funds',
    body: 'You can withdraw your wallet balance to a verified payout method (mobile money, Payoneer or bank). Standard payouts are reviewed and released by our operations team; express withdrawals carry a small fee.',
    order: 3,
  },
  {
    category: 'Payments',
    title: 'Understanding fees',
    slug: 'understanding-fees',
    body: 'Clients pay a service fee when funding a milestone, and a small fee is deducted from each release to the freelancer. Currency conversion and express withdrawals carry their own transparent margins, shown before you confirm.',
    order: 4,
  },
  {
    category: 'Disputes',
    title: 'What to do if a project goes wrong',
    slug: 'filing-a-dispute',
    body: 'If work is not delivered as agreed, you can open a dispute on the milestone during its review window. The funds are frozen while our mediation team reviews the evidence and issues a binding resolution.',
    order: 5,
  },
];

/** Upsert the built-in help-center articles (published). Safe on every boot. */
export async function seedHelpArticles(): Promise<void> {
  for (const article of HELP_ARTICLES) {
    await prisma.helpArticle.upsert({
      where: { slug: article.slug },
      update: {},
      create: { ...article, published: true },
    });
  }
}

const SAMPLE_TICKETS: {
  subject: string;
  category: SupportCategory;
  priority: SupportPriority;
  status: SupportTicketStatus;
  userMessage: string;
  staffReply?: string;
}[] = [
  {
    subject: 'Withdrawal stuck in processing',
    category: 'PAYMENTS',
    priority: 'HIGH',
    status: 'OPEN',
    userMessage: 'My ₦210,000 withdrawal has said “processing” since yesterday. Rent is due - please help.',
    staffReply:
      'Hi - the bank leg was retried this morning and is confirmed on our side. It should reflect within 2 hours; I’ll watch it until it lands.',
  },
  {
    subject: 'Can’t upload ID document',
    category: 'KYC',
    priority: 'NORMAL',
    status: 'OPEN',
    userMessage: 'The app keeps rejecting my ID photo during verification. I’ve tried three times.',
  },
  {
    subject: 'Change payout number',
    category: 'ACCOUNT',
    priority: 'NORMAL',
    status: 'PENDING',
    userMessage: 'I got a new mobile money number and need to update my payout method.',
    staffReply: 'Sure - could you confirm the last 4 digits of the old number so we can verify it’s you?',
  },
  {
    subject: 'Invoice for June fees',
    category: 'PAYMENTS',
    priority: 'LOW',
    status: 'RESOLVED',
    userMessage: 'Could you send me an invoice for the platform fees I paid in June?',
    staffReply: 'Done - your June fee statement has been emailed to you. Let us know if you need anything else.',
  },
  {
    subject: 'Account review taking long',
    category: 'ACCOUNT',
    priority: 'NORMAL',
    status: 'OPEN',
    userMessage: 'My account has been under review for a few days. Any update on the timeline?',
  },
];

/**
 * Seed a demonstrable support queue when none exists, attaching tickets to real
 * accounts so the user-facing side works too. Staff replies are authored by the
 * super admin. No-op if any ticket already exists or there are no users.
 */
export async function seedSupportTickets(): Promise<void> {
  const existing = await prisma.supportTicket.count();
  if (existing > 0) return;

  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE', adminRoleId: null },
    select: { id: true },
    take: SAMPLE_TICKETS.length,
    orderBy: { createdAt: 'asc' },
  });
  if (users.length === 0) return;

  const staff = await prisma.user.findFirst({ where: { adminRole: { isSuperAdmin: true } } });

  for (let index = 0; index < SAMPLE_TICKETS.length && index < users.length; index += 1) {
    const sample = SAMPLE_TICKETS[index];
    const requester = users[index];
    const openedAt = new Date(Date.now() - (index + 1) * 3600_000);
    const ticket = await prisma.supportTicket.create({
      data: {
        userId: requester.id,
        subject: sample.subject,
        category: sample.category,
        priority: sample.priority,
        status: sample.status,
        createdAt: openedAt,
        lastMessageAt: openedAt,
        assignedToId: sample.staffReply ? (staff?.id ?? null) : null,
      },
    });
    await prisma.supportMessage.create({
      data: {
        ticketId: ticket.id,
        senderId: requester.id,
        authorType: 'USER',
        body: sample.userMessage,
        createdAt: openedAt,
      },
    });
    if (sample.staffReply && staff) {
      const repliedAt = new Date(openedAt.getTime() + 90 * 60_000);
      await prisma.supportMessage.create({
        data: {
          ticketId: ticket.id,
          senderId: staff.id,
          authorType: 'STAFF',
          body: sample.staffReply,
          createdAt: repliedAt,
        },
      });
      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { lastMessageAt: repliedAt },
      });
    }
  }
}
