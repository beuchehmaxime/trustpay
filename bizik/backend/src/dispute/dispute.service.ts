import {
  Contract,
  Currency,
  DisputeReason,
  DisputeRulingType,
  DisputeStatus,
  Milestone,
} from '@prisma/client';

import { recomputeContractStatus, resolveParties } from '../lib/contract-flow';
import { ensureAiRecommendation } from '../lib/dispute-ai';
import { FileService } from '../file/file.service';
import { AppError } from '../lib/errors';
import { freelancerFee, releaseNet, round2 } from '../lib/fees';
import { homeCurrencyFor } from '../lib/domain';
import { creditWallet } from '../lib/ledger';
import { roleCan } from '../lib/permissions';
import { usdRateOf } from '../lib/settings';
import * as payments from '../lib/payments';
import { prisma } from '../lib/prisma';
import { NotificationService } from '../notification/notification.service';
import { DisputeRepository } from './dispute.repository';
import { MessageInput, ResolveInput } from './dispute.validation';

const DAY_MS = 24 * 60 * 60 * 1000;
const ADMIN_ROLES = new Set(['admin', 'compliance', 'mediator']);

const REASON_LABEL: Record<DisputeReason, string> = {
  NON_DELIVERY: 'Non-delivery',
  INCOMPLETE_WORK: 'Incomplete work',
  QUALITY_BELOW_SPEC: 'Quality below spec',
  SCOPE_CREEP: 'Scope creep',
  COMMUNICATION_BREAKDOWN: 'Communication breakdown',
  OTHER: 'Other',
};
const STATUS_LABEL: Record<DisputeStatus, string> = {
  FILED: 'Open',
  AWAITING_RESPONSE: 'Awaiting response',
  UNDER_REVIEW: 'Under review',
  ESCALATED: 'Escalated',
  RESOLVED: 'Resolved',
  AUTO_RULED: 'Auto-resolved',
};

type FullContract = Contract & { milestones: Milestone[] };
type Party = { id: string; fullName: string; email: string };

function rulingOutcome(ruling: DisputeRulingType, payee: string, payer: string, pct?: number): string {
  if (ruling === 'FULL_RELEASE') return `released to ${payee}`;
  if (ruling === 'FULL_REFUND') return `refunded to ${payer}`;
  return `split ${pct ?? 0}% to ${payee}, ${100 - (pct ?? 0)}% to ${payer}`;
}


/**
 * The payer's own currency, and the mid-market conversion used at the
 * wallet-escrow boundary - the same pair funding used, so a refund returns
 * exactly what funding took, to the wallet it came from.
 */
async function homeCurrencyOf(userId: string): Promise<Currency> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { country: true } });
  return homeCurrencyFor(user?.country ?? null);
}

function convertMid(amount: number, from: Currency, to: Currency): number {
  if (from === to) return round2(amount);
  return round2(amount * (usdRateOf(from) / usdRateOf(to)));
}


/**
 * Mediator power on the party-facing dispute routes.
 *
 * It used to be decided by the `role` string in the caller's JWT, and every
 * operator is created with `role: 'ADMIN'` regardless of their assigned admin
 * role - so a help-desk or content operator could rule on any dispute on the
 * platform and send the escrowed money wherever they liked. The real
 * `disputes.resolve` permission is the only thing that should grant it.
 */
async function canMediate(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { adminRole: true },
  });
  return roleCan(user?.adminRole, 'disputes.resolve');
}

export const DisputeService = {
  async list(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const contracts = (await DisputeRepository.contractsForUser(
      userId,
      user?.email ?? '',
    )) as FullContract[];
    const byContract = new Map(contracts.map((c) => [c.id, c]));
    const disputes = await DisputeRepository.listForContracts(contracts.map((c) => c.id));

    return disputes.map((d) => {
      const c = byContract.get(d.contractId);
      const m = c?.milestones.find((x) => x.id === d.milestoneId);
      const { payerId } = c ? resolveParties(c) : { payerId: null };
      return {
        id: d.id,
        status: d.status,
        statusLabel: STATUS_LABEL[d.status],
        reason: d.reason,
        reasonLabel: REASON_LABEL[d.reason],
        contractId: d.contractId,
        contractTitle: c?.title ?? 'Project',
        milestoneTitle: m?.title ?? 'Milestone',
        amount: m ? Number(m.amount) : 0,
        currency: c?.currency ?? 'USD',
        viewerRole: userId === payerId ? 'payer' : 'payee',
        filedByYou: d.filedById === userId,
        createdAt: d.createdAt.toISOString(),
        resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null,
      };
    });
  },

  async byId(userId: string, id: string, role = 'client') {
    const d = await DisputeRepository.getById(id);
    if (!d) throw new AppError(404, 'Q-404', 'Dispute not found');
    const c = (await DisputeRepository.getContract(d.contractId)) as FullContract | null;
    if (!c) throw new AppError(404, 'Q-404', 'Project not found');

    const isAdmin = ADMIN_ROLES.has(role.toLowerCase());
    const isParty = c.creatorId === userId || c.counterpartyId === userId;
    if (!isParty && !isAdmin) throw new AppError(403, 'Q-403', 'This dispute was not shared with you.');

    const m = c.milestones.find((x) => x.id === d.milestoneId);
    const { payerId, payeeId } = resolveParties(c);
    const names = (await DisputeRepository.getUsersByIds(
      [c.creatorId, c.counterpartyId, d.filedById, ...d.messages.map((x) => x.senderId)].filter(Boolean) as string[],
    )) as Party[];
    const nameOf = (uid: string | null) => (uid ? names.find((n) => n.id === uid)?.fullName ?? 'Someone' : '');

    const open = d.status !== 'RESOLVED' && d.status !== 'AUTO_RULED';
    const viewerRole = userId === payerId ? 'payer' : userId === payeeId ? 'payee' : 'observer';

    // Advisory AI recommendation (generated on first view if missing).
    const aiRec = await ensureAiRecommendation(id);

    // Resolve all evidence images to hosted URLs.
    const evidenceUrls = new Map(
      (await FileService.urlsForIds(d.evidence.flatMap((item) => item.fileIds))).map((file) => [
        file.id,
        file.url,
      ]),
    );
    const evidence = d.evidence.map((item) => ({
      id: item.id,
      by: nameOf(item.submittedById),
      mine: item.submittedById === userId,
      description: item.description,
      images: item.fileIds.map((fid) => evidenceUrls.get(fid)).filter(Boolean) as string[],
      createdAt: item.createdAt.toISOString(),
    }));

    return {
      id: d.id,
      status: d.status,
      statusLabel: STATUS_LABEL[d.status],
      reason: d.reason,
      reasonLabel: REASON_LABEL[d.reason],
      description: d.description,
      contractId: d.contractId,
      contractTitle: c.title,
      milestoneId: d.milestoneId,
      milestoneTitle: m?.title ?? 'Milestone',
      amount: m ? Number(m.amount) : 0,
      currency: c.currency,
      createdAt: d.createdAt.toISOString(),
      resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null,
      filedByName: nameOf(d.filedById),
      filedByYou: d.filedById === userId,
      viewerRole,
      payerName: c.creatorIsPayer ? nameOf(c.creatorId) : c.counterpartyName,
      payeeName: c.creatorIsPayer ? c.counterpartyName : nameOf(c.creatorId),
      messages: d.messages.map((x) => ({
        id: x.id,
        body: x.body,
        mine: x.senderId === userId,
        senderName: nameOf(x.senderId),
        createdAt: x.createdAt.toISOString(),
      })),
      timeline: d.timeline.map((x) => ({ event: x.event, createdAt: x.createdAt.toISOString() })),
      ruling: d.ruling
        ? {
            ruling: d.ruling.ruling,
            freelancerPct: d.ruling.freelancerPct,
            clientPct: d.ruling.clientPct,
            rationale: d.ruling.rationale,
            ruledAt: d.ruling.ruledAt.toISOString(),
          }
        : null,
      aiRecommendation: aiRec
        ? {
            ruling: aiRec.recommendation,
            freelancerPct: aiRec.freelancerPct,
            confidence: Number(aiRec.confidence),
            rationale: aiRec.rationale ?? 'Model recommendation.',
          }
        : null,
      evidence,
      // What this viewer can do:
      canAddEvidence: open && isParty,
      canMessage: open && (isParty || isAdmin),
      canRelease: open && (viewerRole === 'payer' || isAdmin), // pay the payee
      canRefund: open && (viewerRole === 'payee' || isAdmin), // refund the payer
      canSplit: open && isAdmin,
      canWithdraw: open && d.filedById === userId,
    };
  },

  async addMessage(userId: string, id: string, input: MessageInput, role = 'client') {
    const d = await DisputeRepository.getById(id);
    if (!d) throw new AppError(404, 'Q-404', 'Dispute not found');
    const c = (await DisputeRepository.getContract(d.contractId)) as FullContract | null;
    if (!c) throw new AppError(404, 'Q-404', 'Project not found');
    const isAdmin = ADMIN_ROLES.has(role.toLowerCase());
    if (c.creatorId !== userId && c.counterpartyId !== userId && !isAdmin) {
      throw new AppError(403, 'Q-403', 'This dispute was not shared with you.');
    }
    await DisputeRepository.addMessage(id, userId, input.body);
    const m = c.milestones.find((x) => x.id === d.milestoneId);
    void NotificationService.notifyProjectEvent({
      contract: c,
      actorId: userId,
      event: 'dispute_message',
      data: { milestoneTitle: m?.title },
    });
    return this.byId(userId, id, role);
  },

  /** Add evidence (images + optional note) to an open dispute - either party. */
  async addEvidence(
    userId: string,
    id: string,
    input: { images: string[]; description?: string },
    role = 'client',
  ) {
    const d = await DisputeRepository.getById(id);
    if (!d) throw new AppError(404, 'Q-404', 'Dispute not found');
    if (d.status === 'RESOLVED' || d.status === 'AUTO_RULED') {
      throw new AppError(409, 'Q-409', 'This dispute is already closed.');
    }
    const c = (await DisputeRepository.getContract(d.contractId)) as FullContract | null;
    if (!c) throw new AppError(404, 'Q-404', 'Project not found');
    const isAdmin = ADMIN_ROLES.has(role.toLowerCase());
    if (c.creatorId !== userId && c.counterpartyId !== userId && !isAdmin) {
      throw new AppError(403, 'Q-403', 'This dispute was not shared with you.');
    }
    const fileIds = await FileService.storeImages(userId, input.images, 'dispute');
    if (fileIds.length === 0) throw new AppError(422, 'Q-422', 'No valid images were uploaded.');
    await DisputeRepository.addEvidence(id, userId, fileIds, input.description);
    return this.byId(userId, id, role);
  },

  /** Filer withdraws the dispute → funds unfreeze, milestone goes back to review. */
  async withdraw(userId: string, id: string) {
    const d = await DisputeRepository.getById(id);
    if (!d) throw new AppError(404, 'Q-404', 'Dispute not found');
    if (d.filedById !== userId) {
      throw new AppError(403, 'Q-403', 'Only the party who filed the dispute can withdraw it.');
    }
    if (d.status === 'RESOLVED' || d.status === 'AUTO_RULED') {
      throw new AppError(409, 'Q-409', 'This dispute is already closed.');
    }
    const c = (await DisputeRepository.getContract(d.contractId)) as FullContract;
    const milestone = c.milestones.find((x) => x.id === d.milestoneId);
    if (!milestone) throw new AppError(404, 'Q-404', 'Milestone not found');

    await prisma.$transaction(async (tx) => {
      await tx.milestone.update({
        where: { id: milestone.id },
        data: { status: 'SUBMITTED', autoReleaseAt: new Date(Date.now() + milestone.inspectionDays * DAY_MS) },
      });
      const account = await tx.escrowAccount.findUnique({ where: { contractId: c.id } });
      if (account) await tx.escrowAccount.update({ where: { id: account.id }, data: { status: 'OPEN' } });
      const milestones = c.milestones.map((x) => (x.id === milestone.id ? { status: 'SUBMITTED' as const } : { status: x.status }));
      await tx.contract.update({ where: { id: c.id }, data: { status: recomputeContractStatus(milestones, c.accepted) } });
      await tx.dispute.update({ where: { id }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
      await tx.disputeTimelineEvent.create({ data: { disputeId: id, event: 'WITHDRAWN', actorId: userId } });
    });

    void NotificationService.notifyProjectEvent({
      contract: c,
      actorId: userId,
      event: 'dispute_withdrawn',
      data: { milestoneTitle: milestone.title },
    });
    return this.byId(userId, id);
  },

  /** Resolve a dispute and dispose the held funds per the ruling. */
  async resolve(userId: string, id: string, input: ResolveInput, role = 'client') {
    const d = await DisputeRepository.getById(id);
    if (!d) throw new AppError(404, 'Q-404', 'Dispute not found');
    if (d.status === 'RESOLVED' || d.status === 'AUTO_RULED') {
      throw new AppError(409, 'Q-409', 'This dispute is already resolved.');
    }
    const c = (await DisputeRepository.getContract(d.contractId)) as FullContract;
    const milestone = c.milestones.find((x) => x.id === d.milestoneId);
    if (!milestone) throw new AppError(404, 'Q-404', 'Milestone not found');

    const { payerId, payeeId } = resolveParties(c);
    if (!payeeId) throw new AppError(409, 'Q-409', 'No payee on this project.');
    // Ruling on someone else's dispute moves their money: check the permission,
    // not the token's role claim.
    const isAdmin = await canMediate(userId);
    void role;

    // A party may only concede in the other's favour; splits need a mediator.
    if (input.ruling === 'FULL_RELEASE' && userId !== payerId && !isAdmin) {
      throw new AppError(403, 'Q-403', 'Only the paying party (or a mediator) can release the funds.');
    }
    if (input.ruling === 'FULL_REFUND' && userId !== payeeId && !isAdmin) {
      throw new AppError(403, 'Q-403', 'Only the party getting paid (or a mediator) can refund.');
    }
    if (input.ruling === 'PARTIAL_SPLIT' && !isAdmin) {
      throw new AppError(403, 'Q-403', 'Only a mediator can split the funds.');
    }

    const account = await DisputeRepository.getAccount(c.id);
    if (!account) throw new AppError(409, 'Q-409', 'This milestone is not funded.');

    const amount = round2(Number(milestone.amount));
    const freelancerPct = input.ruling === 'FULL_RELEASE' ? 100 : input.ruling === 'FULL_REFUND' ? 0 : input.freelancerPct ?? 50;
    const clientPct = 100 - freelancerPct;
    const payeeGross = round2((amount * freelancerPct) / 100);
    const payerRefund = round2(amount - payeeGross);
    // Where the refund must land: the payer's wallet, in the payer's currency.
    const refundPayerCurrency = payerId && payerRefund > 0 ? await homeCurrencyOf(payerId) : null;
    const refundToWallet = refundPayerCurrency
      ? convertMid(payerRefund, c.currency, refundPayerCurrency)
      : 0;

    await prisma.$transaction(async (tx) => {
      // A ruling pays out real money, so claim the milestone before moving any:
      // the status was read outside this transaction and two mediators (or a
      // double-submitted ruling) would otherwise both pay the payee.
      const claimed = await tx.milestone.updateMany({
        where: { id: milestone.id, status: { notIn: ['RELEASED', 'CANCELLED'] } },
        data: { status: 'RELEASED', releasedAt: new Date(), approvedAt: new Date(), autoReleaseAt: null },
      });
      if (claimed.count === 0) {
        throw new AppError(409, 'Q-409', 'These funds have already been paid out.');
      }

      // Running totals for the account's status decision below. The stored
      // columns are moved with increment/decrement rather than these values, so
      // a concurrent write on the same escrow account cannot be lost.
      let held = Number(account.heldAmount);
      let released = Number(account.releasedAmount);
      let refunded = Number(account.refundedAmount);

      // Release the payee's share (net of the freelancer fee).
      if (payeeGross > 0) {
        const fee = freelancerFee(payeeGross);
        const net = releaseNet(payeeGross);
        held = round2(held - payeeGross);
        released = round2(released + payeeGross);
        await tx.escrowTransaction.create({
          data: { escrowAccountId: account.id, milestoneId: milestone.id, type: 'RELEASE', amount: payeeGross, currency: c.currency, status: 'COMPLETED', completedAt: new Date() },
        });
        await tx.feeRecord.create({
          data: { escrowAccountId: account.id, contractId: c.id, payerId: payerId ?? undefined, type: 'FREELANCER_FEE', amount: fee, currency: c.currency },
        });
        await creditWallet(tx, {
          userId: payeeId,
          currency: c.currency,
          amount: net,
          type: 'DEPOSIT',
          referenceType: 'dispute',
          referenceId: milestone.id,
          description: `Dispute payout: ${milestone.title}`,
        });
      }

      // Refund the payer's share. This CREDITS their wallet: funding debited it,
      // so a ruling in the payer's favour has to put the money back. Previously
      // only bookkeeping rows were written and the payer received nothing.
      if (payerRefund > 0) {
        const r = await payments.refund({ amount: payerRefund, currency: c.currency });
        if (payerId && refundPayerCurrency && refundToWallet > 0) {
          await creditWallet(tx, {
            userId: payerId,
            currency: refundPayerCurrency,
            amount: refundToWallet,
            type: 'REFUND',
            referenceType: 'dispute_refund',
            referenceId: milestone.id,
            description: `Dispute refund: ${milestone.title}`,
          });
        }
        held = round2(held - payerRefund);
        refunded = round2(refunded + payerRefund);
        await tx.escrowTransaction.create({
          data: { escrowAccountId: account.id, milestoneId: milestone.id, type: 'REFUND', amount: payerRefund, currency: c.currency, status: 'COMPLETED', gateway: r.gateway, gatewayRef: r.gatewayRef, completedAt: new Date() },
        });
        await tx.refund.create({
          data: { escrowAccountId: account.id, amount: payerRefund, currency: c.currency, reasonCode: 'DISPUTE_RESOLUTION', status: 'COMPLETED', gateway: r.gateway, gatewayRef: r.gatewayRef, completedAt: new Date() },
        });
      }

      const milestones = c.milestones.map((x) => (x.id === milestone.id ? { status: 'RELEASED' as const } : { status: x.status }));
      const allReleased = milestones.every((x) => x.status === 'RELEASED');
      await tx.escrowAccount.update({
        where: { id: account.id },
        data: {
          heldAmount: { decrement: round2(payeeGross + payerRefund) },
          releasedAmount: { increment: payeeGross },
          refundedAmount: { increment: payerRefund },
          status: held <= 0 ? (released > 0 ? (allReleased ? 'RELEASED' : 'PARTIALLY_RELEASED') : 'REFUNDED') : 'PARTIALLY_RELEASED',
        },
      });
      // (the milestone was already flipped to RELEASED by the claim above)
      await tx.contract.update({
        where: { id: c.id },
        data: {
          status: recomputeContractStatus(milestones, c.accepted),
          completedAt: allReleased ? new Date() : c.completedAt,
        },
      });
      await tx.disputeRuling.create({
        data: {
          disputeId: id,
          ruling: input.ruling,
          freelancerPct,
          clientPct,
          rationale: input.rationale ?? rulingOutcome(input.ruling, 'payee', 'payer', freelancerPct),
          ruledById: userId,
        },
      });
      await tx.dispute.update({ where: { id }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
      await tx.disputeTimelineEvent.create({ data: { disputeId: id, event: `RESOLVED_${input.ruling}`, actorId: userId } });
    });

    const payeeName = c.creatorIsPayer ? (c.counterpartyName ?? 'the other party') : 'the freelancer';
    const payerName = c.creatorIsPayer ? 'you' : (c.counterpartyName ?? 'the other party');
    void NotificationService.notifyProjectEvent({
      contract: c,
      actorId: userId,
      event: 'dispute_resolved',
      data: { milestoneTitle: milestone.title, amount: rulingOutcome(input.ruling, payeeName, payerName, freelancerPct) },
    });
    return this.byId(userId, id, role);
  },
};
