import { NotificationCategory, NotificationChannel } from '@prisma/client';

import { Currency } from '@prisma/client';

import { sendProjectNotification, sendWalletReceipt } from '../lib/notify';
import { sendSmsMessage } from '../lib/sms';
import { prisma } from '../lib/prisma';
import { NotificationRepository } from './notification.repository';
import {
  RegisterPushTokenInput,
  UpdatePreferencesInput,
} from './notification.validation';

/** Project/escrow lifecycle events that notify both parties. */
export type ProjectEvent =
  | 'accepted'
  | 'declined'
  | 'milestone_added'
  | 'milestone_edited'
  | 'milestone_deleted'
  | 'funded'
  | 'submitted'
  | 'revision'
  | 'released'
  | 'milestone_cancelled'
  | 'project_cancelled'
  | 'project_completed'
  | 'project_deleted'
  | 'dispute_filed'
  | 'dispute_message'
  | 'dispute_withdrawn'
  | 'dispute_resolved';

interface EventCtx {
  actor: string;
  ms?: string;
  amount?: string;
  /** Cancellations: true when escrow money was actually returned to the payer. */
  refunded?: boolean;
}

const EVENT_META: Record<
  ProjectEvent,
  { category: NotificationCategory; heading: string; body: (c: EventCtx, title: string) => string }
> = {
  accepted: {
    category: 'CONTRACT',
    heading: 'Project confirmed',
    body: (c, t) => `${c.actor} confirmed the project “${t}”. You can now fund the first milestone.`,
  },
  declined: {
    category: 'CONTRACT',
    heading: 'Invitation declined',
    body: (c, t) => `${c.actor} declined your invitation to “${t}”.`,
  },
  milestone_added: {
    category: 'CONTRACT',
    heading: 'Milestone added',
    body: (c) => `${c.actor} added a new milestone “${c.ms}” (${c.amount}).`,
  },
  milestone_edited: {
    category: 'CONTRACT',
    heading: 'Milestone updated',
    body: (c) => `${c.actor} updated the milestone “${c.ms}”.`,
  },
  milestone_deleted: {
    category: 'CONTRACT',
    heading: 'Milestone removed',
    body: (c) => `${c.actor} removed the milestone “${c.ms}”.`,
  },
  funded: {
    category: 'PAYMENT',
    heading: 'Escrow funded',
    body: (c) => `${c.actor} funded “${c.ms}” (${c.amount}) into escrow. Work can begin.`,
  },
  submitted: {
    category: 'CONTRACT',
    heading: 'Work submitted',
    body: (c) => `${c.actor} submitted “${c.ms}” for review.`,
  },
  revision: {
    category: 'CONTRACT',
    heading: 'Revision requested',
    body: (c) => `${c.actor} requested a revision on “${c.ms}”.`,
  },
  released: {
    category: 'PAYMENT',
    heading: 'Payment released',
    body: (c) => `${c.amount} was released for “${c.ms}”.`,
  },
  milestone_cancelled: {
    category: 'PAYMENT',
    heading: 'Milestone cancelled',
    body: (c) =>
      c.refunded
        ? `${c.actor} cancelled “${c.ms}” and refunded ${c.amount}.`
        : `${c.actor} cancelled the milestone “${c.ms}” (${c.amount}). It was never funded, so no money moved.`,
  },
  project_cancelled: {
    category: 'CONTRACT',
    heading: 'Project cancelled',
    body: (c, t) =>
      c.refunded
        ? `${c.actor} cancelled the project “${t}”. Any held funds were refunded.`
        : `${c.actor} cancelled the project “${t}”. Nothing had been funded, so no money moved.`,
  },
  project_completed: {
    category: 'CONTRACT',
    heading: 'Project completed',
    body: (c, t) => `${c.actor} marked the project “${t}” as completed. It is now closed.`,
  },
  project_deleted: {
    category: 'CONTRACT',
    heading: 'Project deleted',
    body: (c, t) => `${c.actor} deleted the project “${t}”.`,
  },
  dispute_filed: {
    category: 'DISPUTE',
    heading: 'Dispute filed',
    body: (c) => `${c.actor} opened a dispute on “${c.ms}”. The funds are now frozen.`,
  },
  dispute_message: {
    category: 'DISPUTE',
    heading: 'New dispute message',
    body: (c) => `${c.actor} sent a message in the dispute on “${c.ms}”.`,
  },
  dispute_withdrawn: {
    category: 'DISPUTE',
    heading: 'Dispute withdrawn',
    body: (c) => `${c.actor} withdrew the dispute on “${c.ms}”. The funds are no longer frozen.`,
  },
  dispute_resolved: {
    category: 'DISPUTE',
    heading: 'Dispute resolved',
    body: (c) => `The dispute on “${c.ms}” was resolved - ${c.amount}.`,
  },
};

export type ProjectLike = {
  id: string;
  title: string;
  creatorId: string;
  counterpartyId: string | null;
  counterpartyName: string | null;
  counterpartyEmail: string | null;
};

const CATEGORIES: NotificationCategory[] = [
  'PAYMENT',
  'CONTRACT',
  'KYC',
  'DISPUTE',
  'SECURITY',
  'SYSTEM',
];
const CHANNELS: NotificationChannel[] = ['IN_APP', 'EMAIL', 'PUSH', 'SMS'];

/** Sensible default when a user has never set a given preference. */
function defaultEnabled(channel: NotificationChannel): boolean {
  return channel !== 'SMS'; // SMS off by default; everything else on
}

export const NotificationService = {
  /**
   * Full preference matrix (category × channel), merging the user's stored
   * overrides over the defaults so the client always gets a complete grid.
   */
  async getPreferences(userId: string) {
    const stored = await NotificationRepository.getPreferences(userId);
    const map = new Map(stored.map((p) => [`${p.category}:${p.channel}`, p.enabled]));
    const preferences = CATEGORIES.flatMap((category) =>
      CHANNELS.map((channel) => ({
        category,
        channel,
        enabled: map.get(`${category}:${channel}`) ?? defaultEnabled(channel),
      })),
    );
    return { preferences };
  },

  async updatePreferences(userId: string, input: UpdatePreferencesInput) {
    for (const p of input.preferences) {
      await NotificationRepository.upsertPreference(userId, p.category, p.channel, p.enabled);
    }
    return this.getPreferences(userId);
  },

  async registerPushToken(userId: string, input: RegisterPushTokenInput) {
    await NotificationRepository.registerPushToken(userId, input.token, input.platform);
    return { success: true };
  },

  async list(userId: string) {
    const rows = await NotificationRepository.listNotifications(userId);
    return rows.map((n) => ({
      id: n.id,
      category: n.category,
      title: n.title,
      body: n.body,
      isCritical: n.isCritical,
      read: !!n.readAt,
      entityType: n.entityType,
      entityId: n.entityId,
      createdAt: n.createdAt.toISOString(),
    }));
  },

  markRead(userId: string, id: string) {
    return NotificationRepository.markRead(userId, id).then(() => ({ success: true }));
  },

  markAllRead(userId: string) {
    return NotificationRepository.markAllRead(userId).then(() => ({ success: true }));
  },

  async unreadCount(userId: string) {
    return { count: await NotificationRepository.unreadCount(userId) };
  },

  /**
   * Notify BOTH parties of a project about a lifecycle action - an in-app
   * notification (for registered users) and an email. Best-effort and
   * non-blocking: a notification failure never breaks the underlying action.
   */
  async notifyProjectEvent(opts: {
    contract: ProjectLike;
    actorId: string;
    event: ProjectEvent;
    data?: { milestoneTitle?: string; amount?: string; refunded?: boolean };
  }) {
    try {
      const { contract, actorId, event, data } = opts;
      const ids = [contract.creatorId, contract.counterpartyId].filter(Boolean) as string[];
      const users = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, fullName: true, email: true },
      });
      const byId = new Map(users.map((u) => [u.id, u]));

      const meta = EVENT_META[event];
      const actorName = byId.get(actorId)?.fullName ?? 'Someone';
      const body = meta.body(
        { actor: actorName, ms: data?.milestoneTitle, amount: data?.amount, refunded: data?.refunded },
        contract.title,
      );

      const creator = byId.get(contract.creatorId);
      const cp = contract.counterpartyId ? byId.get(contract.counterpartyId) : undefined;
      const recipients = [
        creator && { userId: creator.id, email: creator.email, name: creator.fullName },
        {
          userId: cp?.id,
          email: cp?.email ?? contract.counterpartyEmail ?? null,
          name: cp?.fullName ?? contract.counterpartyName ?? 'Invited user',
        },
      ].filter(Boolean) as { userId?: string; email: string | null; name: string }[];

      for (const r of recipients) {
        if (r.userId) {
          await NotificationRepository.create({
            userId: r.userId,
            category: meta.category,
            title: meta.heading,
            body,
            channels: ['IN_APP', 'EMAIL'],
            entityType: 'contract',
            entityId: contract.id,
            deliveries: {
              create: [
                { channel: 'IN_APP', status: 'DELIVERED' },
                { channel: 'EMAIL', status: 'SENT' },
              ],
            },
          });
        }
        if (!r.email) continue; // phone-only invitee with no account yet
        void sendProjectNotification({
          to: r.email,
          name: r.name,
          heading: meta.heading,
          body,
          projectTitle: contract.title,
        }).catch((e) => console.error('[notify] email failed:', (e as Error).message));
      }
    } catch (e) {
      console.error('[notify] project event failed:', (e as Error).message);
    }
  },

  /**
   * Remind BOTH parties that a milestone's delivery date is coming up (fired the
   * day before `deadline`). In-app notification for registered users + an email.
   * Best-effort; a failure here never blocks the scheduler.
   */
  async notifyDeliveryDue(opts: {
    contract: ProjectLike;
    milestoneTitle: string;
    dueLabel: string;
  }) {
    try {
      const { contract, milestoneTitle, dueLabel } = opts;
      const heading = 'Delivery due tomorrow';
      const body = `Reminder: “${milestoneTitle}” in the deal “${contract.title}” is due on ${dueLabel}. Please make sure everything is on track.`;

      const creator = contract.creatorId
        ? await prisma.user.findUnique({
            where: { id: contract.creatorId },
            select: { id: true, fullName: true, email: true },
          })
        : null;
      const cp = contract.counterpartyId
        ? await prisma.user.findUnique({
            where: { id: contract.counterpartyId },
            select: { id: true, fullName: true, email: true },
          })
        : null;

      const recipients = [
        creator && { userId: creator.id, email: creator.email, name: creator.fullName },
        {
          userId: cp?.id,
          email: cp?.email ?? contract.counterpartyEmail ?? null,
          name: cp?.fullName ?? contract.counterpartyName ?? 'Invited user',
        },
      ].filter(Boolean) as { userId?: string; email: string | null; name: string }[];

      for (const recipient of recipients) {
        if (recipient.userId) {
          await NotificationRepository.create({
            userId: recipient.userId,
            category: 'CONTRACT',
            title: heading,
            body,
            channels: ['IN_APP', 'EMAIL'],
            entityType: 'contract',
            entityId: contract.id,
            deliveries: {
              create: [
                { channel: 'IN_APP', status: 'DELIVERED' },
                { channel: 'EMAIL', status: 'SENT' },
              ],
            },
          });
        }
        if (!recipient.email) continue; // phone-only invitee with no account yet
        void sendProjectNotification({
          to: recipient.email,
          name: recipient.name,
          heading,
          body,
          projectTitle: contract.title,
        }).catch((error) => console.error('[notify] reminder email failed:', (error as Error).message));
      }
    } catch (error) {
      console.error('[notify] delivery reminder failed:', (error as Error).message);
    }
  },

  /**
   * Tell both sides about a wallet-to-wallet payment. The recipient's message is
   * the important one - money arriving unannounced is alarming - so it goes to
   * every channel we can reach them on, WhatsApp included (with SMS as the
   * fallback when their 24-hour window is shut).
   */
  async notifyTransfer(opts: {
    transferId: string;
    senderId: string;
    senderLabel: string;
    senderName: string;
    recipientId: string;
    recipientLabel: string;
    amount: number;
    currency: Currency;
    note: string | null;
    senderBalanceAfter: number;
    recipientBalanceAfter: number;
  }) {
    try {
      const money = `${opts.amount.toLocaleString('en-US', { minimumFractionDigits: 0 })} ${opts.currency}`;
      const because = opts.note ? ` - “${opts.note}”` : '';

      const [sender, recipient] = await Promise.all([
        prisma.user.findUnique({
          where: { id: opts.senderId },
          select: { email: true, fullName: true, phone: true },
        }),
        prisma.user.findUnique({
          where: { id: opts.recipientId },
          select: { email: true, fullName: true, phone: true },
        }),
      ]);

      const rows: {
        userId: string;
        title: string;
        body: string;
      }[] = [
        {
          userId: opts.recipientId,
          title: 'Money received',
          body: `${opts.senderName} (${opts.senderLabel}) sent you ${money}${because}. Your new balance is ${opts.recipientBalanceAfter.toLocaleString('en-US')} ${opts.currency}.`,
        },
        {
          userId: opts.senderId,
          title: 'Money sent',
          body: `You sent ${money} to ${opts.recipientLabel}${because}. Your new balance is ${opts.senderBalanceAfter.toLocaleString('en-US')} ${opts.currency}.`,
        },
      ];

      for (const row of rows) {
        await NotificationRepository.create({
          userId: row.userId,
          category: 'PAYMENT',
          title: row.title,
          body: row.body,
          channels: ['IN_APP', 'EMAIL'],
          entityType: 'transfer',
          entityId: opts.transferId,
          deliveries: { create: [{ channel: 'IN_APP', status: 'DELIVERED' }] },
        });
      }

      // Reach the recipient wherever they actually are.
      const { WhatsAppNotify } = await import('../whatsapp/whatsapp-notify');
      const onWhatsApp = await WhatsAppNotify.moneyReceived(opts.recipientId, {
        text: `💰 ${rows[0].body}`,
      });
      if (!onWhatsApp && recipient?.phone) {
        void sendSmsMessage(recipient.phone, `BiZik: ${rows[0].body}`).catch(() => undefined);
      }
      if (recipient?.email) {
        void sendProjectNotification({
          to: recipient.email,
          name: recipient.fullName,
          heading: rows[0].title,
          body: rows[0].body,
          projectTitle: 'BiZik wallet',
        }).catch(() => undefined);
      }
      if (sender?.email) {
        void sendProjectNotification({
          to: sender.email,
          name: sender.fullName,
          heading: rows[1].title,
          body: rows[1].body,
          projectTitle: 'BiZik wallet',
        }).catch(() => undefined);
      }
    } catch (error) {
      console.error('[notify] transfer notification failed:', (error as Error).message);
    }
  },

  /**
   * Notify a user about a wallet deposit or withdrawal - an in-app notification
   * + an email receipt carrying the transaction ID (like a real bank). Best
   * effort; never breaks the underlying money movement.
   */
  async notifyWalletEvent(opts: {
    userId: string;
    kind: 'deposit' | 'withdrawal';
    amount: number;
    currency: Currency;
    reference: string;
    balanceAfter: number;
    fee?: number;
    method?: string;
  }) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: opts.userId },
        select: { email: true, fullName: true, phone: true },
      });
      if (!user) return;

      const fmt = (n: number) =>
        `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${opts.currency}`;
      const isDeposit = opts.kind === 'deposit';
      const heading = isDeposit ? 'Money added to your wallet' : 'Withdrawal processed';
      const body = isDeposit
        ? `${fmt(opts.amount)} was added to your wallet. New balance: ${fmt(opts.balanceAfter)}. Ref ${opts.reference}.`
        : `${fmt(opts.amount)} was withdrawn${opts.method ? ` to ${opts.method}` : ''}. New balance: ${fmt(opts.balanceAfter)}. Ref ${opts.reference}.`;

      // Text the account owner about the money movement (deposit / withdrawal).
      const hasPhone = Boolean(user.phone);
      const channels: NotificationChannel[] = hasPhone
        ? ['IN_APP', 'EMAIL', 'SMS']
        : ['IN_APP', 'EMAIL'];

      await NotificationRepository.create({
        userId: opts.userId,
        category: 'PAYMENT',
        title: heading,
        body,
        channels,
        entityType: 'wallet',
        entityId: opts.reference,
        deliveries: {
          create: hasPhone
            ? [
                { channel: 'IN_APP', status: 'DELIVERED' },
                { channel: 'EMAIL', status: 'SENT' },
                { channel: 'SMS', status: 'SENT' },
              ]
            : [
                { channel: 'IN_APP', status: 'DELIVERED' },
                { channel: 'EMAIL', status: 'SENT' },
              ],
        },
      });

      if (user.phone) {
        const smsBody = isDeposit
          ? `BiZik: ${fmt(opts.amount)} added to your wallet. Balance ${fmt(opts.balanceAfter)}. Ref ${opts.reference}.`
          : `BiZik: ${fmt(opts.amount)} withdrawn${opts.method ? ` to ${opts.method}` : ''}. Balance ${fmt(opts.balanceAfter)}. Ref ${opts.reference}.`;
        void sendSmsMessage(user.phone, smsBody).catch((error) =>
          console.error('[notify] wallet SMS failed:', (error as Error).message),
        );
      }

      void sendWalletReceipt({
        to: user.email,
        name: user.fullName,
        kind: opts.kind,
        amount: fmt(opts.amount),
        reference: opts.reference,
        balanceAfter: fmt(opts.balanceAfter),
        date: new Date().toUTCString(),
        fee: opts.fee ? fmt(opts.fee) : undefined,
        method: opts.method,
      }).catch((e) => console.error('[notify] wallet email failed:', (e as Error).message));
    } catch (e) {
      console.error('[notify] wallet event failed:', (e as Error).message);
    }
  },
};
