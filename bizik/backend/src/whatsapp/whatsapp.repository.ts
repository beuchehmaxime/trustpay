import { WhatsAppDirection } from '@prisma/client';

import { prisma } from '../lib/prisma';

/**
 * Durable WhatsApp-channel data: the phone→user link + per-user channel
 * settings (PIN hash, opt-in, lock), and an audit log of messages. Conversation
 * state itself is ephemeral (Redis, see whatsapp-session.ts).
 */
export const WhatsAppRepository = {
  /** Find the BiZik user that owns this phone number (identity mapping). */
  findUserByPhone(phone: string) {
    return prisma.user.findUnique({
      where: { phone },
      select: { id: true, fullName: true, phone: true, locale: true, status: true, kycTier: true },
    });
  },

  getChannelByUser(userId: string) {
    return prisma.whatsAppChannel.findUnique({ where: { userId } });
  },

  getChannelByPhone(phone: string) {
    return prisma.whatsAppChannel.findUnique({ where: { phone } });
  },

  /**
   * Link (or refresh) the channel for this user. `inbound` marks that they just
   * messaged us, which reopens WhatsApp's 24-hour service window - the thing
   * that decides whether we may send them free-form text later.
   */
  upsertChannel(userId: string, phone: string, locale: string, inbound = false) {
    const seen = inbound ? { lastInboundAt: new Date() } : {};
    return prisma.whatsAppChannel.upsert({
      where: { userId },
      create: { userId, phone, locale, ...seen },
      update: { phone, locale, ...seen },
    });
  },

  setPinHash(userId: string, pinHash: string) {
    return prisma.whatsAppChannel.update({
      where: { userId },
      data: { pinHash, pinFailures: 0 },
    });
  },

  bumpPinFailures(userId: string) {
    return prisma.whatsAppChannel.update({
      where: { userId },
      data: { pinFailures: { increment: 1 } },
    });
  },

  resetPinFailures(userId: string) {
    return prisma.whatsAppChannel.update({ where: { userId }, data: { pinFailures: 0 } });
  },

  setLocked(userId: string, locked: boolean) {
    return prisma.whatsAppChannel.update({ where: { userId }, data: { locked } });
  },

  setOptIn(userId: string, optIn: boolean) {
    return prisma.whatsAppChannel.update({ where: { userId }, data: { optIn } });
  },

  /** Append to the message audit log. Never store PINs/secrets in `body`. */
  logMessage(entry: {
    phone: string;
    userId?: string | null;
    direction: WhatsAppDirection;
    waMessageId?: string | null;
    kind: string;
    body?: string | null;
  }) {
    return prisma.whatsAppMessage.create({
      data: {
        phone: entry.phone,
        userId: entry.userId ?? null,
        direction: entry.direction,
        waMessageId: entry.waMessageId ?? null,
        kind: entry.kind,
        body: entry.body ? entry.body.slice(0, 2000) : null,
      },
    });
  },

  /**
   * Drop chat logs past the retention window. Run nightly by the scheduler -
   * the log exists for support/compliance, not indefinite conversation storage.
   */
  async purgeMessagesOlderThan(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const { count } = await prisma.whatsAppMessage.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return count;
  },

  /** Inbound dedup - Meta may redeliver a webhook; ignore already-seen ids. */
  async alreadyProcessed(waMessageId: string): Promise<boolean> {
    const seen = await prisma.whatsAppMessage.findFirst({
      where: { waMessageId, direction: 'INBOUND' },
      select: { id: true },
    });
    return !!seen;
  },

  /**
   * The user's verification standing, for menu + messaging:
   *  - verified   → KYC approved (tier reached)
   *  - processing → submitted / under review (waiting on our judgment)
   *  - more_info  → declined asking for more/clearer documents (resubmittable)
   *  - rejected   → declined (can start over)
   *  - none       → never submitted
   */
  async getKycState(
    userId: string,
    requiredTier: number,
  ): Promise<'verified' | 'processing' | 'more_info' | 'rejected' | 'none'> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { kycTier: true } });
    if (user && user.kycTier >= requiredTier) return 'verified';
    const record = await prisma.kycRecord.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { status: true, rejectionReason: true },
    });
    if (!record) return 'none';
    if (record.status === 'SUBMITTED' || record.status === 'UNDER_REVIEW') return 'processing';
    if (record.status === 'REJECTED') {
      return (record.rejectionReason ?? '').startsWith('More documents needed:') ? 'more_info' : 'rejected';
    }
    return 'none';
  },

  /** The most recent rejection reason (for the "more info" / declined message). */
  async getLatestKycReason(userId: string): Promise<string | null> {
    const record = await prisma.kycRecord.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { rejectionReason: true },
    });
    return record?.rejectionReason ?? null;
  },

  /** Have we ever sent the one-time welcome to this number? (persistent). */
  async hasWelcomed(phone: string): Promise<boolean> {
    const seen = await prisma.whatsAppMessage.findFirst({
      where: { phone, direction: 'OUTBOUND', kind: 'welcome' },
      select: { id: true },
    });
    return !!seen;
  },

  /** The most recent open deal this phone was invited to (by phone, no account yet). */
  async findPendingInvite(phone: string) {
    const contract = await prisma.contract.findFirst({
      where: {
        counterpartyPhone: phone,
        status: { in: ['INVITED', 'UNDER_REVIEW', 'SIGNED'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, currency: true, creatorId: true, milestones: { select: { amount: true } } },
    });
    if (!contract) return null;
    const creator = await prisma.user.findUnique({
      where: { id: contract.creatorId },
      select: { fullName: true },
    });
    const amount = contract.milestones.reduce((sum, milestone) => sum + Number(milestone.amount), 0);
    return {
      id: contract.id,
      title: contract.title,
      currency: contract.currency as string,
      amount,
      creatorName: creator?.fullName ?? 'Someone',
    };
  },

  /**
   * Deals this user created that they can still cancel: nothing has been funded
   * yet (every milestone is still PENDING or already cancelled) and the deal is
   * neither cancelled nor completed. Whether the other party has accepted makes
   * no difference - a pending deal is cancellable until money moves.
   */
  async cancellableDealsByCreator(creatorId: string) {
    const contracts = await prisma.contract.findMany({
      where: {
        creatorId,
        status: { notIn: ['CANCELLED', 'COMPLETED'] },
        milestones: { none: { status: { notIn: ['PENDING', 'CANCELLED'] } } },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        currency: true,
        accepted: true,
        counterpartyName: true,
        counterpartyPhone: true,
        milestones: { select: { id: true, title: true, amount: true, status: true } },
      },
    });
    return contracts.map((contract) => ({
      id: contract.id,
      title: contract.title,
      currency: contract.currency as string,
      accepted: contract.accepted,
      counterpartyName: contract.counterpartyName,
      counterpartyPhone: contract.counterpartyPhone,
      amount: contract.milestones
        .filter((milestone) => milestone.status !== 'CANCELLED')
        .reduce((sum, milestone) => sum + Number(milestone.amount), 0),
    }));
  },

  /**
   * Deals this user created that are still awaiting the other party's response -
   * the set whose invitations can be (re)sent. Excludes accepted/cancelled deals.
   */
  async pendingInvitesByCreator(creatorId: string) {
    const contracts = await prisma.contract.findMany({
      where: { creatorId, accepted: false, status: 'INVITED' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        currency: true,
        counterpartyName: true,
        counterpartyPhone: true,
        milestones: { select: { amount: true } },
      },
    });
    return contracts.map((contract) => ({
      id: contract.id,
      title: contract.title,
      currency: contract.currency as string,
      counterpartyName: contract.counterpartyName,
      counterpartyPhone: contract.counterpartyPhone,
      amount: contract.milestones.reduce((sum, milestone) => sum + Number(milestone.amount), 0),
    }));
  },
};
