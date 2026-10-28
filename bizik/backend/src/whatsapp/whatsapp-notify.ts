import { config } from '../config/env';
import { prisma } from '../lib/prisma';
import { WhatsAppClient } from './whatsapp-client';
import { WhatsAppRepository } from './whatsapp.repository';

function money(amount: number, currency = 'XAF'): string {
  const symbol = currency === 'XAF' ? 'FCFA' : currency;
  return `${symbol} ${Math.abs(amount).toLocaleString('en-US')}`;
}

/** Outcome of trying to reach a counterparty on WhatsApp. */
export type InviteResult =
  | { ok: true; delivered: boolean; reason: 'sent' | 'not_reachable' }
  | { ok: false; reason: 'not_eligible' | 'disabled' | 'no_phone' };

/**
 * Proactive WhatsApp notifications for platform events (currently KYC outcomes).
 * Kept dependency-light (no import of whatsapp.service) to avoid an import
 * cycle: KYC/admin services call this; it only touches the client + DB.
 * Best-effort and silent when WhatsApp is disabled or the user has no channel.
 */
/**
 * May we send this NUMBER a proactive message? Someone who replied STOP has
 * opted out, and honouring that is a WhatsApp Business policy requirement - not
 * just a courtesy. Numbers with no channel yet (never messaged us) are allowed:
 * that is the invite path, and it still falls back to SMS when undeliverable.
 */
/**
 * WhatsApp only delivers free-form messages within 24 hours of the person's
 * last message to us. Outside that window Meta may still ACCEPT the API call
 * (HTTP 200) and then silently drop it, reporting the failure asynchronously -
 * so a 200 is not proof of delivery. We therefore decide up front, from the
 * last time they wrote to us, and let the caller use SMS instead.
 */
const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function withinServiceWindow(lastInboundAt: Date | null): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - lastInboundAt.getTime() < SERVICE_WINDOW_MS;
}

async function mayMessagePhone(phone: string): Promise<boolean> {
  const channel = await prisma.whatsAppChannel.findUnique({
    where: { phone },
    select: { optIn: true, lastInboundAt: true },
  });
  if (!channel) return true; // never messaged us - the invite path is allowed to try
  return channel.optIn && withinServiceWindow(channel.lastInboundAt);
}

/**
 * Send a proactive message to a user's WhatsApp. Returns whether it actually
 * went out - Meta refuses free-form text outside the 24-hour service window, so
 * "we have a channel for them" is NOT the same as "they received it". Callers
 * that must reach the person use the answer to fall back to SMS.
 */
async function pushText(userId: string, text: string): Promise<boolean> {
  if (!config.whatsapp.enabled) return false;
  const channel = await prisma.whatsAppChannel.findUnique({
    where: { userId },
    select: { phone: true, optIn: true, lastInboundAt: true },
  });
  if (!channel || !channel.optIn) return false;
  if (!withinServiceWindow(channel.lastInboundAt)) {
    // Not reachable by free-form WhatsApp right now - say so honestly so the
    // caller can text them instead of a message that would never arrive.
    console.log(
      `[whatsapp][notify] skipped - outside the 24h window for ${channel.phone.slice(-4)} (last inbound: ${
        channel.lastInboundAt?.toISOString() ?? 'never'
      })`,
    );
    return false;
  }
  try {
    const result = await WhatsAppClient.sendText(channel.phone, text);
    // Only record what was really delivered, so the audit log stays honest.
    if (result.ok) {
      await WhatsAppRepository.logMessage({
        phone: channel.phone,
        userId,
        direction: 'OUTBOUND',
        kind: 'notification',
        body: text,
      });
    }
    return result.ok;
  } catch (error) {
    console.error('[whatsapp][notify] failed', (error as Error).message);
    return false;
  }
}

export const WhatsAppNotify = {
  /** Tell the user their KYC decision. `reason` distinguishes more-info vs reject. */
  async kycStatus(userId: string, status: 'APPROVED' | 'REJECTED', reason?: string): Promise<void> {
    if (status === 'APPROVED') {
      const owner = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true },
      });
      const handle = owner?.username ? `\n\nYour handle for receiving money: *@${owner.username}*` : '';
      await pushText(
        userId,
        '✅ Good news! Your BiZik account is now *verified*.\n\nYou can now create deals and send money. Just say "create a deal", "send 5000 to @handle", or type MENU.' +
          handle,
      );
      return;
    }
    // REJECTED - either "needs more info" (resubmittable) or a hard decline.
    const moreInfo = !!reason && reason.startsWith('More documents needed:');
    if (moreInfo) {
      const detail = reason!.replace('More documents needed:', '').trim();
      await pushText(
        userId,
        `📎 We need a bit more to verify you:\n${detail || 'clearer / additional documents'}\n\nReply *VERIFY* (or tap "Provide more information") to resend your documents.`,
      );
    } else {
      await pushText(
        userId,
        `❌ Your verification wasn't approved${reason ? `:\n${reason}` : '.'}\n\nYou can try again: reply *VERIFY* to start over.`,
      );
    }
  },

  /**
   * Proactively invite the deal's counterparty on WhatsApp: "<creator> is
   * inviting you to a deal - accept or decline". Best-effort: if the number
   * isn't reachable on WhatsApp we say so (an SMS invite still goes out from
   * ContractService). Only eligible while the deal is still awaiting a response;
   * a declined/cancelled or already-accepted deal can't be (re)invited.
   *
   * When `notifyCreator` is set, the creator is told the outcome on their own
   * WhatsApp (used for the automatic invite on deal creation). The bot's manual
   * "resend" path reads the returned result instead and replies itself.
   */
  async dealInvite(
    contractId: string,
    opts: { notifyCreator?: boolean; resend?: boolean } = {},
  ): Promise<InviteResult> {
    if (!config.whatsapp.enabled) return { ok: false, reason: 'disabled' };
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        title: true,
        currency: true,
        accepted: true,
        status: true,
        creatorId: true,
        counterpartyName: true,
        counterpartyPhone: true,
        milestones: { select: { amount: true } },
      },
    });
    if (!contract || !contract.counterpartyPhone) return { ok: false, reason: 'no_phone' };
    // Only pending, un-accepted invitations can be (re)sent.
    if (contract.accepted || contract.status !== 'INVITED') {
      return { ok: false, reason: 'not_eligible' };
    }
    // Respect an opt-out: report it as "not reachable here" so the caller still
    // falls back to SMS instead of silently dropping the invitation.
    if (!(await mayMessagePhone(contract.counterpartyPhone))) {
      return { ok: true, delivered: false, reason: 'not_reachable' };
    }

    const creator = await prisma.user.findUnique({
      where: { id: contract.creatorId },
      select: { fullName: true },
    });
    const inviterName = creator?.fullName ?? 'Someone';
    const inviteeName = contract.counterpartyName ?? 'your invitee';
    const amount = contract.milestones.reduce((sum, milestone) => sum + Number(milestone.amount), 0);
    const lead = opts.resend ? '🔔 *Reminder*: ' : '👋 ';
    // Make clear this is BiZik messaging on the inviter's behalf, not the
    // inviter personally, and that BiZik holds the money as a neutral escrow.
    const body =
      `${lead}This is *BiZik* messaging you on behalf of *${inviterName}*.\n\n` +
      `${inviterName} wants to do a secure deal with you and has invited you here:\n\n` +
      `• ${contract.title}\n` +
      `• ${money(amount, contract.currency)}\n\n` +
      `BiZik is a neutral escrow service: we hold the money safely until the deal is delivered and approved, so neither side can be scammed. ` +
      `Do you want to *accept* this deal or *decline* it?`;

    const sent = await WhatsAppClient.sendButtons(contract.counterpartyPhone, body, [
      { id: 'accept_deal', title: 'Accept deal' },
      { id: 'decline_deal', title: 'Decline' },
    ]);

    if (sent.ok) {
      await WhatsAppRepository.logMessage({
        phone: contract.counterpartyPhone,
        userId: null,
        direction: 'OUTBOUND',
        kind: 'deal_invite',
        body: `invite → ${inviteeName} for ${contract.title}`,
      });
    }

    if (opts.notifyCreator) {
      if (sent.ok) {
        await pushText(
          contract.creatorId,
          `📨 We've invited *${inviteeName}* to "${contract.title}" on WhatsApp. You'll be notified when they accept or decline.`,
        );
      } else {
        await pushText(
          contract.creatorId,
          `*${inviteeName}* doesn't seem reachable on WhatsApp yet, so we've sent them an SMS invite instead. You can *resend invite* later once they're on WhatsApp.`,
        );
      }
    }

    return { ok: true, delivered: sent.ok, reason: sent.ok ? 'sent' : 'not_reachable' };
  },

  /**
   * Deliver a party-to-party reminder over WhatsApp. Returns whether it went
   * out, so the caller can fall back to SMS for someone who has never used the
   * assistant (or has opted out of it).
   */
  async dealReminder(userId: string, text: string): Promise<boolean> {
    if (!config.whatsapp.enabled) return false;
    const channel = await prisma.whatsAppChannel.findUnique({
      where: { userId },
      select: { phone: true, optIn: true },
    });
    if (!channel || !channel.optIn) return false;
    return pushText(userId, text);
  },

  /** Confirm on WhatsApp that money the user added has landed in their wallet. */
  async walletToppedUp(userId: string, opts: { amount: string }): Promise<boolean> {
    return pushText(
      userId,
      `✅ ${opts.amount} has been added to your BiZik wallet.\n\nSay *my balance* to see it, or *send 5000 to @handle* to pay someone.`,
    );
  },

  /** Confirm on WhatsApp that a direct Mobile Money payment reached escrow. */
  async escrowFunded(userId: string, opts: { dealTitle: string; amount: string }): Promise<boolean> {
    return pushText(
      userId,
      `✅ Payment received. ${opts.amount} is now held safely in escrow for *${opts.dealTitle}*.\n\nIt is released to the seller only once you approve the delivery.`,
    );
  },

  /** Tell someone on WhatsApp that money landed in their wallet. */
  async moneyReceived(userId: string, opts: { text: string }): Promise<boolean> {
    return pushText(userId, opts.text);
  },

  /** Tell the invitee (over WhatsApp) that the creator cancelled the deal. */
  async dealCancelledToInvitee(contractId: string): Promise<void> {
    if (!config.whatsapp.enabled) return;
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { title: true, creatorId: true, counterpartyPhone: true },
    });
    if (!contract || !contract.counterpartyPhone) return;
    if (!(await mayMessagePhone(contract.counterpartyPhone))) return;
    const creator = await prisma.user.findUnique({
      where: { id: contract.creatorId },
      select: { fullName: true },
    });
    const who = creator?.fullName ?? 'The other party';
    try {
      await WhatsAppClient.sendText(
        contract.counterpartyPhone,
        `${who} has cancelled the deal "${contract.title}". No action is needed on your side.`,
      );
    } catch (error) {
      console.error('[whatsapp][notify] cancel-to-invitee failed', (error as Error).message);
    }
  },

  /** Tell the creator their invitee ACCEPTED - with the creator's next step. */
  async dealAccepted(contractId: string, accepterName?: string): Promise<void> {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { title: true, creatorId: true, counterpartyName: true, creatorIsPayer: true },
    });
    if (!contract) return;
    const who = accepterName || contract.counterpartyName || 'The other party';
    const next = contract.creatorIsPayer
      ? "You're the *buyer*. The next step is to *fund* the deal so work can start. Just say \"fund my deal\"."
      : "You're the *seller*. Once the buyer funds the escrow, deliver the work and you'll be paid. I'll keep you posted.";
    await pushText(
      contract.creatorId,
      `🎉 Good news! *${who}* accepted your deal "${contract.title}".\n\n${next}`,
    );
  },

  /** Tell the creator their invitee declined - the deal is now cancelled. */
  async dealDeclined(contractId: string, declinerName?: string): Promise<void> {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { title: true, creatorId: true, counterpartyName: true },
    });
    if (!contract) return;
    const who = declinerName || contract.counterpartyName || 'The invitee';
    await pushText(
      contract.creatorId,
      `❌ *${who}* declined your deal "${contract.title}", so it has been cancelled. You can start a new deal anytime, just say "create a deal".`,
    );
  },
};
