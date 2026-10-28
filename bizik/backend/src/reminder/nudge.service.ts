import { AppError } from '../lib/errors';
import { sendProjectNotification } from '../lib/notify';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { sendSmsMessage } from '../lib/sms';
import { NotificationRepository } from '../notification/notification.repository';
import { WhatsAppNotify } from '../whatsapp/whatsapp-notify';
import { NUDGE_HEADINGS, nudgeBody, pendingStep, type NudgeAction } from './nudge-step';

/**
 * "Nudge the other party" - a party-to-party reminder about whatever the deal
 * is waiting on. Either side can send it: a seller reminds the buyer to fund or
 * to approve a delivery, a buyer reminds the seller to deliver or to accept the
 * invitation. It is deliberately NOT a free-text message: BiZik composes the
 * wording from the deal's real state, so this channel can't be used to pressure,
 * impersonate or scam anyone, and it is rate-limited per deal per sender.
 */

export type { NudgeAction } from './nudge-step';

export interface NudgeOutcome {
  sent: boolean;
  /** What the recipient was reminded to do (or what the sender owes instead). */
  action?: NudgeAction;
  /** Set when the pending step is the SENDER's own - nobody was messaged. */
  yourMove?: boolean;
  /** Set when the deal has nothing pending (closed, disputed, all released). */
  nothingPending?: boolean;
  /** Set when this deal was nudged too recently by this sender. */
  tooSoon?: boolean;
  waitMinutes?: number;
  recipientName?: string;
  message?: string;
  /** Which channels actually accepted the reminder (in_app, email, whatsapp, sms). */
  channels?: string[];
}

/** One nudge per deal per sender per window - a reminder, not a hammer. */
const COOLDOWN_MINUTES = Number(process.env.DEAL_NUDGE_COOLDOWN_MIN) || 360;

export const NudgeService = {
  /**
   * Remind the other party about this deal's pending step. `actorUserId` must be
   * a party to the deal.
   */
  async remind(actorUserId: string, contractId: string): Promise<NudgeOutcome> {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: { milestones: { orderBy: { order: 'asc' } } },
    });
    if (!contract) throw new AppError(404, 'Q-404', 'Deal not found');
    if (contract.creatorId !== actorUserId && contract.counterpartyId !== actorUserId) {
      throw new AppError(403, 'Q-403', 'This deal was not shared with you.');
    }
    if (contract.status === 'CANCELLED' || contract.status === 'COMPLETED') {
      return { sent: false, nothingPending: true };
    }

    const step = pendingStep(contract);
    if (!step) return { sent: false, nothingPending: true };
    if (step.owedBy === actorUserId) {
      return { sent: false, yourMove: true, action: step.action };
    }

    // Rate limit before doing any work, so a retry loop can't spam either.
    const key = `deal:nudge:${contractId}:${actorUserId}`;
    const existing = await redis.ttl(key);
    if (existing > 0) {
      return { sent: false, tooSoon: true, waitMinutes: Math.ceil(existing / 60), action: step.action };
    }

    const [actor, recipient] = await Promise.all([
      prisma.user.findUnique({ where: { id: actorUserId }, select: { fullName: true } }),
      step.owedBy
        ? prisma.user.findUnique({
            where: { id: step.owedBy },
            select: { id: true, fullName: true, email: true, phone: true },
          })
        : Promise.resolve(null),
    ]);
    const actorName = actor?.fullName ?? 'The other party';
    const recipientName =
      recipient?.fullName ?? contract.counterpartyName ?? 'the other party';

    const heading = NUDGE_HEADINGS[step.action];
    const body = nudgeBody(step.action, {
      actorName,
      dealTitle: contract.title,
      milestoneTitle: step.milestone?.title,
      autoReleaseAt: step.milestone?.autoReleaseAt ?? null,
    });

    // An invitee who has not joined yet has no account to notify - the invite
    // itself IS the reminder, and it already handles WhatsApp + SMS fallback.
    if (!recipient) {
      const invited = await WhatsAppNotify.dealInvite(contract.id, { resend: true });
      await redis.set(key, '1', { EX: COOLDOWN_MINUTES * 60 });
      return {
        sent: invited.ok,
        action: step.action,
        recipientName,
        message: body,
      };
    }

    await NotificationRepository.create({
      userId: recipient.id,
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

    if (recipient.email) {
      void sendProjectNotification({
        to: recipient.email,
        name: recipient.fullName,
        heading,
        body,
        projectTitle: contract.title,
      }).catch((error) => console.error('[nudge] email failed:', (error as Error).message));
    }
    const channels = ['in_app'];
    if (recipient.email) channels.push('email');

    // WhatsApp honours the recipient's opt-out AND Meta's 24-hour window: a
    // free-form message to someone who hasn't written in a day is refused, so
    // this reports what really happened rather than assuming it landed.
    const onWhatsApp = await WhatsAppNotify.dealReminder(recipient.id, `${heading}\n\n${body}`);
    if (onWhatsApp) {
      channels.push('whatsapp');
    } else if (recipient.phone) {
      // Text them instead - a reminder nobody receives is not a reminder.
      channels.push('sms');
      void sendSmsMessage(recipient.phone, `BiZik: ${body}`).catch((error) =>
        console.error('[nudge] sms failed:', (error as Error).message),
      );
    }

    await redis.set(key, '1', { EX: COOLDOWN_MINUTES * 60 });
    return { sent: true, action: step.action, recipientName, message: body, channels };
  },

  /** What the deal is waiting on right now, from the viewer's perspective. */
  async pending(actorUserId: string, contractId: string) {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: { milestones: { orderBy: { order: 'asc' } } },
    });
    if (!contract) throw new AppError(404, 'Q-404', 'Deal not found');
    const step = pendingStep(contract);
    if (!step) return { action: null as NudgeAction | null, yourMove: false };
    return { action: step.action, yourMove: step.owedBy === actorUserId };
  },
};
