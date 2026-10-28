import crypto from 'crypto';

import { Currency, MilestoneStatus, PaymentGateway } from '@prisma/client';

import { config } from '../config/env';
import { ContractService } from '../contract/contract.service';
import { recomputeContractStatus, resolveParties } from '../lib/contract-flow';
import { emitAdminEvent } from '../lib/admin-events';
import { homeCurrencyFor } from '../lib/domain';
import { ensureAiRecommendation } from '../lib/dispute-ai';
import { FileService } from '../file/file.service';
import { AppError } from '../lib/errors';
import { assertCanTransact } from '../lib/kyc-gate';
import { clientServiceFee, freelancerFee, releaseNet, round2 } from '../lib/fees';
import { creditWallet, debitWallet } from '../lib/ledger';
import * as payments from '../lib/payments';
import { prisma } from '../lib/prisma';
import { usdRateOf } from '../lib/settings';
import { NotificationService } from '../notification/notification.service';
import { EscrowRepository } from './escrow.repository';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Every account transacts in ITS OWN home currency: the payer funds (and is
 * charged) in their currency, the payee is paid in theirs. Escrow itself keeps
 * accounting in the deal currency, so we convert at the wallet⇄escrow boundary
 * using the mid-market rate (matches the `fxToViewer` figure shown in the UI).
 */
function convertMid(amount: number, from: Currency, to: Currency): number {
  if (from === to) return round2(amount);
  return round2(amount * (usdRateOf(from) / usdRateOf(to)));
}

/** The home currency of a party, from their country (defaults to USD). */
async function homeCurrencyOf(userId: string): Promise<Currency> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { country: true } });
  return homeCurrencyFor(user?.country ?? null);
}

/**
 * Escrow Service (SRS MOD-05, FR-PAY-001..005/011). Holds client funds against
 * a contract, releases milestone-by-milestone to the payee's wallet (less the
 * platform fee), auto-releases after the inspection period, and refunds on
 * cancellation. All balance mutations run inside a single DB transaction so a
 * fund/release/refund is atomic across escrow ledger + wallet (FR-PAY-003).
 */
export const EscrowService = {
  /**
   * What funding this milestone costs the payer, in THEIR own currency, plus
   * whether their wallet can already cover it. Used before collecting money
   * (the WhatsApp assistant, the fund screens) so the amount quoted, charged and
   * debited is the same number computed by one piece of code.
   */
  async fundingQuote(userId: string, milestoneId: string) {
    const m = await EscrowRepository.getMilestone(milestoneId);
    if (!m) throw new AppError(404, 'Q-404', 'Milestone not found');
    const c = m.contract;
    const { payerId } = resolveParties(c);
    if (!payerId || userId !== payerId) {
      throw new AppError(403, 'Q-403', 'Only the paying party can fund escrow.');
    }

    const amount = round2(Number(m.amount));
    const fee = clientServiceFee(amount);
    const payerCurrency = await homeCurrencyOf(payerId);
    const payAmount = convertMid(amount, c.currency, payerCurrency);
    const payFee = convertMid(fee, c.currency, payerCurrency);
    const total = round2(payAmount + payFee);

    const wallet = await prisma.wallet.findUnique({
      where: { userId_currency: { userId: payerId, currency: payerCurrency } },
    });
    const balance = wallet ? Number(wallet.balance) : 0;

    return {
      milestoneId: m.id,
      milestoneTitle: m.title,
      dealId: c.id,
      dealTitle: c.title,
      currency: payerCurrency,
      amount: payAmount,
      fee: payFee,
      total,
      walletBalance: balance,
      walletCovers: balance >= total,
      shortfall: round2(Math.max(0, total - balance)),
    };
  },

  /**
   * Fund a milestone by charging a Mobile Money number DIRECTLY - the payer gets
   * a payment prompt on that phone instead of needing a wallet balance. The
   * deposit carries what it is for, so escrow is funded only once the provider
   * confirms the money (never on the initial "accepted").
   */
  async fundFromNumber(
    userId: string,
    milestoneId: string,
    source: { payoutMethodId?: string; phoneNumber?: string; provider?: 'MTN_MOBILE_MONEY' | 'ORANGE_MONEY' },
  ) {
    // Re-checks that this user is the payer and the milestone is fundable.
    const quote = await this.fundingQuote(userId, milestoneId);
    const m = await EscrowRepository.getMilestone(milestoneId);
    if (!m) throw new AppError(404, 'Q-404', 'Milestone not found');
    if (!m.contract.accepted) {
      throw new AppError(409, 'Q-409', 'The project must be confirmed before funding.');
    }
    if (m.status === 'CANCELLED') {
      throw new AppError(409, 'Q-409', 'This milestone was cancelled and can no longer be funded.');
    }
    if (m.status !== 'PENDING') throw new AppError(409, 'Q-409', 'This milestone is already funded.');
    if (!source.payoutMethodId && !source.phoneNumber) {
      throw new AppError(400, 'Q-400', 'A Mobile Money number (or saved method) is required.');
    }

    const { PaymentService } = await import('../payments/application/payment.service');
    const transaction = await PaymentService.createDeposit({
      userId,
      amount: quote.total,
      currency: quote.currency,
      payoutMethodId: source.payoutMethodId,
      provider: source.payoutMethodId ? undefined : source.provider ?? 'MTN_MOBILE_MONEY',
      phoneNumber: source.payoutMethodId ? undefined : source.phoneNumber,
      purpose: 'FUND_MILESTONE',
      purposeRefId: milestoneId,
    });
    return { quote, payment: { id: transaction.id, status: transaction.status, reference: transaction.transactionReference } };
  },

  /**
   * Fund a single milestone from the payer's wallet → holds it in escrow.
   * Money visibly leaves the payer's available balance (milestone + service fee)
   * and shows up as "in escrow" for both parties until release.
   */
  async fundMilestone(userId: string, milestoneId: string, source: { payoutMethodId?: string } = {}) {
    // Funding debits the payer's wallet, so a frozen or unverified account must
    // not be able to do it - the same bar as sending or withdrawing.
    await assertCanTransact(userId, 'deal');
    const m = await EscrowRepository.getMilestone(milestoneId);
    if (!m) throw new AppError(404, 'Q-404', 'Milestone not found');
    const c = m.contract;
    if (!c.accepted) throw new AppError(409, 'Q-409', 'The project must be confirmed before funding.');
    if (c.status === 'COMPLETED' || c.status === 'CANCELLED') {
      throw new AppError(409, 'Q-409', 'This project is closed.');
    }

    const { payerId, payeeId } = resolveParties(c);
    if (!payerId || !payeeId) {
      throw new AppError(409, 'Q-409', 'Both parties must have a BiZik account before funding.');
    }
    if (userId !== payerId) {
      throw new AppError(403, 'Q-403', 'Only the paying party can fund escrow.');
    }
    if (m.status === 'CANCELLED') {
      throw new AppError(409, 'Q-409', 'This milestone was cancelled and can no longer be funded.');
    }
    if (m.status !== 'PENDING') {
      throw new AppError(409, 'Q-409', 'This milestone is already funded.');
    }

    const amount = round2(Number(m.amount));
    const fee = clientServiceFee(amount);
    const total = round2(amount + fee);

    // The payer pays in THEIR OWN home currency (escrow still holds the deal
    // currency). Convert the milestone amount + fee across for the charge/debit.
    const dealCurrency = c.currency;
    const payerCurrency = await homeCurrencyOf(payerId);
    const payAmount = convertMid(amount, dealCurrency, payerCurrency);
    const payFee = convertMid(fee, dealCurrency, payerCurrency);
    const payTotal = round2(payAmount + payFee);

    // Funding source: a saved payment method (MoMo / bank / …) charged directly,
    // or - by default - the payer's BiZik wallet balance (in their currency).
    let chargeGateway: PaymentGateway | undefined;
    if (source.payoutMethodId) {
      // This branch settles against the SIMULATED gateway and holds escrow
      // immediately, without waiting for a provider confirmation - safe for
      // development, but in live mode it would hold real escrow against money
      // that never arrived. Live pay-ins go through the provider-agnostic
      // deposit flow instead (which funds the milestone on its webhook).
      if (config.payments.mode === 'live') {
        throw new AppError(
          400,
          'Q-400',
          'Pay for this deal from your Mobile Money number or your wallet balance.',
        );
      }
      const method = await prisma.payoutMethod.findFirst({
        where: { id: source.payoutMethodId, userId: payerId, deletedAt: null },
      });
      if (!method) throw new AppError(404, 'Q-404', 'Payment method not found.');
      const rail = payments.methodFromPayoutType(method.type, method.provider);
      const chargeResult = await payments.charge({
        amount: payTotal,
        currency: payerCurrency,
        method: rail.method,
        provider: rail.provider,
      });
      if (chargeResult.status !== 'SUCCEEDED') {
        throw new AppError(402, 'Q-402', chargeResult.failureReason ?? 'Payment failed. Please try again.');
      }
      chargeGateway = chargeResult.gateway;
    } else {
      const wallet = await prisma.wallet.findUnique({
        where: { userId_currency: { userId: payerId, currency: payerCurrency } },
      });
      const balance = wallet ? Number(wallet.balance) : 0;
      if (balance < payTotal) {
        throw new AppError(
          402,
          'Q-402',
          `You need ${payTotal} ${payerCurrency} in your wallet to fund this (incl. ${payFee} ${payerCurrency} fee). Top up your wallet first.`,
        );
      }
    }

    const key = crypto.randomUUID();
    await prisma.$transaction(async (tx) => {
      const account =
        (await tx.escrowAccount.findUnique({ where: { contractId: c.id } })) ??
        (await tx.escrowAccount.create({
          data: {
            contractId: c.id,
            subAccountRef: `ESC-${c.id}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
            currency: dealCurrency,
          },
        }));

      // 0) Claim the milestone. The PENDING check above ran on a row read
      //    OUTSIDE this transaction, so two submits (a double tap, a retry) can
      //    both reach here having seen PENDING. This conditional update is the
      //    real gate: only the transaction that actually flips the row funds the
      //    milestone, the other aborts before any money moves.
      const claimed = await tx.milestone.updateMany({
        where: { id: m.id, status: 'PENDING' },
        data: { status: 'FUNDED' },
      });
      if (claimed.count === 0) {
        throw new AppError(409, 'Q-409', 'This milestone is already funded.');
      }

      // 1) The payer's money leaves - from their wallet (in their currency) when
      //    funding from balance; nothing here when charged to an external method.
      if (!source.payoutMethodId) {
        await debitWallet(tx, {
          userId: payerId,
          currency: payerCurrency,
          amount: payAmount,
          type: 'ESCROW_HOLD',
          referenceType: 'escrow_fund',
          referenceId: m.id,
          description: `${c.title} · ${m.title}`,
        });
        // No service-fee line when the fee is zero (FEE_CLIENT_PCT=0).
        if (payFee > 0) await debitWallet(tx, {
          userId: payerId,
          currency: payerCurrency,
          amount: payFee,
          type: 'FEE',
          referenceType: 'fee',
          referenceId: m.id,
          description: `Service fee · ${c.title}`,
        });
      }

      // 2) Escrow holds the milestone amount. `increment` so the database does
      //    the arithmetic in place: computing heldAmount + amount in JS from a
      //    value read earlier loses the other transaction's write when two
      //    milestones on the same contract are funded at once.
      await tx.escrowAccount.update({
        where: { id: account.id },
        data: { heldAmount: { increment: amount }, status: 'OPEN' },
      });
      await tx.escrowTransaction.create({
        data: {
          escrowAccountId: account.id,
          milestoneId: m.id,
          type: 'FUND',
          amount,
          currency: c.currency,
          status: 'COMPLETED',
          gateway: chargeGateway ?? 'INTERNAL',
          idempotencyKey: key,
          completedAt: new Date(),
        },
      });
      await tx.feeRecord.create({
        data: {
          escrowAccountId: account.id,
          contractId: c.id,
          payerId: userId,
          type: 'CLIENT_SERVICE_FEE',
          amount: fee,
          currency: c.currency,
        },
      });
      // (the milestone was already flipped to FUNDED by the claim above)
      const milestones = c.milestones.map((x) =>
        x.id === m.id ? { status: 'FUNDED' as MilestoneStatus } : { status: x.status },
      );
      await tx.contract.update({
        where: { id: c.id },
        data: {
          status: recomputeContractStatus(milestones, c.accepted),
          fundedAt: c.fundedAt ?? new Date(),
        },
      });
    });

    void NotificationService.notifyProjectEvent({
      contract: c,
      actorId: userId,
      event: 'funded',
      data: { milestoneTitle: m.title, amount: `${amount} ${c.currency}` },
    });
    return ContractService.byId(userId, c.id);
  },

  /** Manually release a funded/submitted milestone (payer approval). */
  async release(userId: string, milestoneId: string) {
    const contractId = await this._releaseCore(milestoneId, { actorUserId: userId, auto: false });
    return ContractService.byId(userId, contractId);
  },

  /** Internal release used by both manual approval and auto-release. */
  async _releaseCore(milestoneId: string, opts: { actorUserId: string | null; auto: boolean }) {
    const m = await EscrowRepository.getMilestone(milestoneId);
    if (!m) throw new AppError(404, 'Q-404', 'Milestone not found');
    const c = m.contract;
    const { payerId, payeeId } = resolveParties(c);
    if (!payeeId) throw new AppError(409, 'Q-409', 'No payee on this project.');

    if (!opts.auto && opts.actorUserId !== payerId) {
      throw new AppError(403, 'Q-403', 'Only the paying party can release funds.');
    }
    if (m.status === 'DISPUTED') {
      throw new AppError(409, 'Q-409', 'These funds are frozen by an open dispute.');
    }
    if (!['FUNDED', 'ACTIVE', 'SUBMITTED', 'APPROVED'].includes(m.status)) {
      throw new AppError(409, 'Q-409', 'This milestone cannot be released yet.');
    }

    const account = await EscrowRepository.getAccountByContract(c.id);
    if (!account) throw new AppError(409, 'Q-409', 'This milestone is not funded.');

    const amount = round2(Number(m.amount));
    const fee = freelancerFee(amount);
    const net = releaseNet(amount);

    // The payee is paid into their own home-currency wallet (escrow accounts in
    // the deal currency, so convert the net across at the mid-market rate).
    const payeeCurrency = await homeCurrencyOf(payeeId);
    const payeeNet = convertMid(net, c.currency, payeeCurrency);

    await prisma.$transaction(async (tx) => {
      // Claim the release the same way funding claims the funding: the status
      // check above read a row outside this transaction, so a manual release
      // racing the auto-release job could otherwise pay the payee twice.
      const claimed = await tx.milestone.updateMany({
        where: { id: m.id, status: { in: ['FUNDED', 'ACTIVE', 'SUBMITTED', 'APPROVED'] } },
        data: { status: 'RELEASED', releasedAt: new Date(), autoReleaseAt: null },
      });
      if (claimed.count === 0) {
        throw new AppError(409, 'Q-409', 'These funds have already been released.');
      }

      const milestones = c.milestones.map((x) =>
        x.id === m.id ? { status: 'RELEASED' as MilestoneStatus } : { status: x.status },
      );
      const allReleased = milestones.every((x) => x.status === 'RELEASED');

      await tx.escrowAccount.update({
        where: { id: account.id },
        data: {
          heldAmount: { decrement: amount },
          releasedAmount: { increment: amount },
          status: allReleased ? 'RELEASED' : 'PARTIALLY_RELEASED',
        },
      });
      await tx.escrowTransaction.create({
        data: {
          escrowAccountId: account.id,
          milestoneId: m.id,
          type: 'RELEASE',
          amount,
          currency: c.currency,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
      await tx.feeRecord.create({
        data: {
          escrowAccountId: account.id,
          contractId: c.id,
          payerId: payerId ?? undefined,
          type: 'FREELANCER_FEE',
          amount: fee,
          currency: c.currency,
        },
      });
      await creditWallet(tx, {
        userId: payeeId,
        currency: payeeCurrency,
        amount: payeeNet,
        type: 'DEPOSIT',
        referenceType: 'milestone',
        referenceId: m.id,
        description: `${c.title} · ${m.title}`,
      });
      // status/releasedAt/autoReleaseAt were set by the claim; only approvedAt
      // is left to record.
      await tx.milestone.update({
        where: { id: m.id },
        data: { approvedAt: m.approvedAt ?? new Date() },
      });
      await tx.contract.update({
        where: { id: c.id },
        data: {
          status: recomputeContractStatus(milestones, c.accepted),
          completedAt: allReleased ? new Date() : c.completedAt,
        },
      });
    });

    void NotificationService.notifyProjectEvent({
      contract: c,
      actorId: opts.actorUserId ?? c.creatorId,
      event: 'released',
      data: { milestoneTitle: m.title, amount: `${payeeNet} ${payeeCurrency}` },
    });
    return c.id;
  },

  /**
   * Party-facing project cancellation. Cancelling is a deal-lifecycle action, not
   * an escrow one: only the creator may cancel, and only while nothing has been
   * funded (see {@link ContractService.cancel}). Kept here so existing clients
   * hitting /escrow/contract/:id/cancel follow the same single rule.
   */
  async cancel(userId: string, contractId: string, reason?: string) {
    return ContractService.cancel(userId, contractId, reason);
  },

  /**
   * Internal cancel + refund core, shared by the party-facing {@link cancel} and
   * the admin force-cancel. Refunds any held (unreleased) funds to the payer and
   * moves the contract to CANCELLED. No party check - callers gate access.
   */
  async _cancelCore(
    c: NonNullable<Awaited<ReturnType<typeof EscrowRepository.getContract>>>,
    actorId: string | null,
    reason?: string,
  ) {
    if (c.status === 'COMPLETED' || c.status === 'CANCELLED') {
      throw new AppError(409, 'Q-409', 'This project is already closed.');
    }
    if (c.milestones.some((m) => m.status === 'DISPUTED')) {
      throw new AppError(409, 'Q-409', 'Resolve the open dispute before cancelling.');
    }

    const account = await EscrowRepository.getAccountByContract(c.id);
    const heldMilestones = c.milestones.filter(
      (m) => m.status === 'FUNDED' || m.status === 'ACTIVE' || m.status === 'SUBMITTED',
    );
    const refundTotal = round2(heldMilestones.reduce((s, m) => s + Number(m.amount), 0));

    // Held funds were debited from the payer's wallet at funding; cancelling
    // has to put them back there, in the payer's own currency.
    const { payerId: cancelPayerId } = resolveParties(c);
    const cancelPayerCurrency = cancelPayerId ? await homeCurrencyOf(cancelPayerId) : null;
    const cancelRefundToWallet =
      cancelPayerId && cancelPayerCurrency && refundTotal > 0
        ? convertMid(refundTotal, c.currency, cancelPayerCurrency)
        : 0;

    await prisma.$transaction(async (tx) => {
      for (const m of heldMilestones) {
        await tx.milestone.update({ where: { id: m.id }, data: { status: 'PENDING', autoReleaseAt: null } });
      }
      if (account && refundTotal > 0) {
        const r = await payments.refund({ amount: refundTotal, currency: c.currency });
        await tx.escrowAccount.update({
          where: { id: account.id },
          data: {
            heldAmount: { decrement: refundTotal },
            refundedAmount: { increment: refundTotal },
            status: 'REFUNDED',
          },
        });
        await tx.escrowTransaction.create({
          data: {
            escrowAccountId: account.id,
            type: 'REFUND',
            amount: refundTotal,
            currency: c.currency,
            status: 'COMPLETED',
            gateway: r.gateway,
            gatewayRef: r.gatewayRef,
            completedAt: new Date(),
          },
        });
        await tx.refund.create({
          data: {
            escrowAccountId: account.id,
            amount: refundTotal,
            currency: c.currency,
            reasonCode: reason ?? 'CONTRACT_CANCELLED',
            status: 'COMPLETED',
            gateway: r.gateway,
            gatewayRef: r.gatewayRef,
            completedAt: new Date(),
          },
        });
      }
      if (cancelPayerId && cancelPayerCurrency && cancelRefundToWallet > 0) {
        await creditWallet(tx, {
          userId: cancelPayerId,
          currency: cancelPayerCurrency,
          amount: cancelRefundToWallet,
          type: 'REFUND',
          referenceType: 'escrow_refund',
          referenceId: c.id,
          description: `Refund · ${c.title} (cancelled)`,
        });
      }
      await tx.contract.update({
        where: { id: c.id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason },
      });
    });

    void NotificationService.notifyProjectEvent({
      contract: c,
      actorId: actorId ?? c.creatorId,
      event: 'project_cancelled',
      data: { refunded: true },
    });
    return c.id;
  },

  /**
   * Party-facing milestone cancellation - the creator drops an unfunded
   * milestone. A FUNDED milestone holds money and can no longer be cancelled by
   * a party; it is refunded through a dispute or by an admin
   * ({@link _refundMilestoneCore}).
   */
  async cancelMilestone(userId: string, milestoneId: string) {
    return ContractService.cancelMilestone(userId, milestoneId);
  },

  /**
   * Internal refund of a single funded milestone - refunds its held amount to
   * the payer and returns the milestone to PENDING. Shared by the party-facing
   * {@link cancelMilestone} and the admin escrow console. No party check.
   */
  async _refundMilestoneCore(
    m: NonNullable<Awaited<ReturnType<typeof EscrowRepository.getMilestone>>>,
    actorId: string | null,
    reasonCode: string,
  ) {
    const c = m.contract;
    if (m.status === 'PENDING') {
      throw new AppError(409, 'Q-409', 'This milestone is not funded - delete it instead.');
    }
    if (m.status === 'RELEASED') {
      throw new AppError(409, 'Q-409', 'This milestone is already paid out.');
    }
    if (m.status === 'DISPUTED') {
      throw new AppError(409, 'Q-409', 'Resolve the open dispute before cancelling.');
    }

    const account = await EscrowRepository.getAccountByContract(c.id);
    if (!account) throw new AppError(409, 'Q-409', 'This milestone is not funded.');
    const amount = round2(Number(m.amount));

    // Funding DEBITED the payer's wallet, so a refund has to CREDIT it back.
    // Without this the escrow rows balanced while the payer's money simply
    // stopped existing. Converted the same way funding converted it, so the
    // payer is made whole in their own currency.
    const { payerId: refundPayerId } = resolveParties(c);
    const refundPayerCurrency = refundPayerId ? await homeCurrencyOf(refundPayerId) : null;
    const refundToWallet =
      refundPayerId && refundPayerCurrency
        ? convertMid(amount, c.currency, refundPayerCurrency)
        : 0;

    await prisma.$transaction(async (tx) => {
      // Claim the refund before any money moves - without it a double submit
      // refunds the same milestone twice.
      const claimed = await tx.milestone.updateMany({
        where: { id: m.id, status: { in: ['FUNDED', 'ACTIVE', 'SUBMITTED', 'APPROVED'] } },
        data: { status: 'PENDING', autoReleaseAt: null, submittedAt: null },
      });
      if (claimed.count === 0) {
        throw new AppError(409, 'Q-409', 'This milestone has already been refunded or released.');
      }

      const refundRes = await payments.refund({ amount, currency: c.currency });
      const newHeld = round2(Number(account.heldAmount) - amount);
      const released = Number(account.releasedAmount);
      await tx.escrowAccount.update({
        where: { id: account.id },
        data: {
          heldAmount: { decrement: amount },
          refundedAmount: { increment: amount },
          status: newHeld <= 0 && released <= 0 ? 'REFUNDED' : released > 0 ? 'PARTIALLY_RELEASED' : 'OPEN',
        },
      });
      await tx.escrowTransaction.create({
        data: {
          escrowAccountId: account.id,
          milestoneId: m.id,
          type: 'REFUND',
          amount,
          currency: c.currency,
          status: 'COMPLETED',
          gateway: refundRes.gateway,
          gatewayRef: refundRes.gatewayRef,
          completedAt: new Date(),
        },
      });
      await tx.refund.create({
        data: {
          escrowAccountId: account.id,
          amount,
          currency: c.currency,
          reasonCode,
          status: 'COMPLETED',
          gateway: refundRes.gateway,
          gatewayRef: refundRes.gatewayRef,
          completedAt: new Date(),
        },
      });
      if (refundPayerId && refundPayerCurrency && refundToWallet > 0) {
        await creditWallet(tx, {
          userId: refundPayerId,
          currency: refundPayerCurrency,
          amount: refundToWallet,
          type: 'REFUND',
          referenceType: 'escrow_refund',
          referenceId: m.id,
          description: `Refund · ${c.title} · ${m.title}`,
        });
      }
      // (the milestone was already reset to PENDING by the claim above)
      const milestones = c.milestones.map((x) =>
        x.id === m.id ? { status: 'PENDING' as MilestoneStatus } : { status: x.status },
      );
      await tx.contract.update({
        where: { id: c.id },
        data: { status: recomputeContractStatus(milestones, c.accepted) },
      });
    });
    void NotificationService.notifyProjectEvent({
      contract: c,
      actorId: actorId ?? c.creatorId,
      event: 'milestone_cancelled',
      data: { milestoneTitle: m.title, amount: `${amount} ${c.currency}`, refunded: true },
    });
    return c.id;
  },

  /**
   * File a dispute on a submitted milestone - immediately freezes the funds
   * (SRS FR-DIS-001). Mediator resolution is handled by the dispute/admin flow.
   */
  async fileDispute(
    userId: string,
    milestoneId: string,
    input: { reason: string; description: string; images?: string[] },
  ) {
    const m = await EscrowRepository.getMilestone(milestoneId);
    if (!m) throw new AppError(404, 'Q-404', 'Milestone not found');
    const c = m.contract;
    if (c.creatorId !== userId && c.counterpartyId !== userId) {
      throw new AppError(403, 'Q-403', 'This project was not shared with you.');
    }
    if (m.status !== 'SUBMITTED') {
      throw new AppError(409, 'Q-409', 'You can only dispute submitted work during its review period.');
    }

    // Upload any evidence images to Cloudinary before opening the case.
    const evidenceFileIds = input.images?.length
      ? await FileService.storeImages(userId, input.images, 'dispute')
      : [];

    let disputeId: string | undefined;
    await prisma.$transaction(async (tx) => {
      const dispute = await tx.dispute.create({
        data: {
          contractId: c.id,
          milestoneId: m.id,
          filedById: userId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          reason: input.reason as any,
          description: input.description,
          status: 'FILED',
          responseDeadline: new Date(Date.now() + 3 * DAY_MS),
        },
      });
      disputeId = dispute.id;
      if (evidenceFileIds.length > 0) {
        await tx.disputeEvidence.create({
          data: {
            disputeId: dispute.id,
            submittedById: userId,
            description: input.description,
            fileIds: evidenceFileIds,
          },
        });
      }
      await tx.milestone.update({ where: { id: m.id }, data: { status: 'DISPUTED', autoReleaseAt: null } });
      const account = await tx.escrowAccount.findUnique({ where: { contractId: c.id } });
      if (account) {
        await tx.escrowAccount.update({ where: { id: account.id }, data: { status: 'FROZEN' } });
      }
      await tx.contract.update({ where: { id: c.id }, data: { status: 'DISPUTED' } });
    });
    void NotificationService.notifyProjectEvent({
      contract: c,
      actorId: userId,
      event: 'dispute_filed',
      data: { milestoneTitle: m.title },
    });
    // Generate the AI resolution recommendation for the new case (best-effort).
    if (disputeId) void ensureAiRecommendation(disputeId);
    // Alert the disputes team - funds are now frozen and need a mediator.
    void emitAdminEvent({
      type: 'DISPUTE_FILED',
      severity: 'WARNING',
      title: 'New dispute filed',
      body: `A dispute was opened on “${m.title}” (${c.title}). Escrow funds are frozen pending resolution.`,
      permission: 'disputes.view',
      entityType: 'Dispute',
      entityId: disputeId,
      link: disputeId ? `/disputes/${disputeId}` : '/disputes',
      actorId: userId,
    });
    return ContractService.byId(userId, c.id);
  },

  /**
   * Escrow balances for a contract (project detail screen). Party-checked:
   * only the payer/payee may read it. Admin/internal callers that have already
   * authorised access use {@link _summaryCore} directly.
   */
  async summary(userId: string, contractId: string) {
    const contract = await EscrowRepository.getContract(contractId);
    if (!contract || (contract.creatorId !== userId && contract.counterpartyId !== userId)) {
      throw new AppError(404, 'Q-404', 'Project not found');
    }
    return this._summaryCore(contractId);
  },

  /** Shape the escrow summary WITHOUT an ownership check - callers must gate access. */
  async _summaryCore(contractId: string) {
    const account = await EscrowRepository.getAccountWithTransactions(contractId);
    if (!account) {
      return { held: 0, released: 0, refunded: 0, currency: null, transactions: [] };
    }
    return {
      held: Number(account.heldAmount),
      released: Number(account.releasedAmount),
      refunded: Number(account.refundedAmount),
      currency: account.currency,
      status: account.status,
      transactions: account.transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        currency: t.currency,
        status: t.status,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  },

  /** Auto-release every SUBMITTED milestone whose inspection period elapsed. */
  async tickAutoReleases() {
    const due = await EscrowRepository.dueForAutoRelease(new Date());
    let released = 0;
    for (const { id } of due) {
      try {
        await this._releaseCore(id, { actorUserId: null, auto: true });
        released += 1;
      } catch (e) {
        console.error('[escrow] auto-release failed for', id, (e as Error).message);
      }
    }
    if (due.length) console.log(`[escrow] auto-release: ${released}/${due.length} milestones`);
    return { checked: due.length, released };
  },
};
