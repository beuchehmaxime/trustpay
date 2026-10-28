import {
  Currency,
  PaymentOperation,
  PaymentProviderName,
  PaymentTransaction,
  Prisma,
} from '@prisma/client';

import { prisma } from '../../lib/prisma';

type Db = Prisma.TransactionClient | typeof prisma;

export interface CreatePendingInput {
  userId: string;
  transactionReference: string;
  provider: PaymentProviderName;
  operation: PaymentOperation;
  amount: number;
  /** The rail's cut, charged on top of `amount`. Estimated at creation. */
  providerFee?: number;
  currency: Currency;
  phoneNumber?: string;
  /** What the money is for, when it isn't a plain wallet top-up. */
  purpose?: string;
  purposeRefId?: string;
}

/** Data access for the provider-agnostic payment ledger (PaymentTransaction). */
export const PaymentRepository = {
  createPending(input: CreatePendingInput, db: Db = prisma): Promise<PaymentTransaction> {
    return db.paymentTransaction.create({
      data: {
        userId: input.userId,
        transactionReference: input.transactionReference,
        provider: input.provider,
        operation: input.operation,
        amount: input.amount,
        providerFee: input.providerFee,
        currency: input.currency,
        phoneNumber: input.phoneNumber,
        purpose: input.purpose,
        purposeRefId: input.purposeRefId,
        status: 'PENDING',
      },
    });
  },

  findById(id: string, db: Db = prisma): Promise<PaymentTransaction | null> {
    return db.paymentTransaction.findUnique({ where: { id } });
  },

  findByTransactionReference(reference: string, db: Db = prisma): Promise<PaymentTransaction | null> {
    return db.paymentTransaction.findUnique({ where: { transactionReference: reference } });
  },

  findByProviderReference(reference: string, db: Db = prisma): Promise<PaymentTransaction | null> {
    return db.paymentTransaction.findUnique({ where: { providerReference: reference } });
  },

  /** Transactions still awaiting a final outcome, oldest first (reconciliation). */
  findStale(olderThanMs: number, limit = 50): Promise<PaymentTransaction[]> {
    return prisma.paymentTransaction.findMany({
      where: {
        status: 'PROCESSING',
        providerReference: { not: null },
        updatedAt: { lt: new Date(Date.now() - olderThanMs) },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  },

  markProcessing(
    id: string,
    providerReference: string,
    providerResponse: Prisma.InputJsonValue | undefined,
    db: Db = prisma,
  ): Promise<PaymentTransaction> {
    return db.paymentTransaction.update({
      where: { id },
      data: { status: 'PROCESSING', providerReference, providerResponse },
    });
  },

  markSuccessful(
    id: string,
    fields: { providerTransactionId?: string; walletReference?: string },
    db: Db = prisma,
  ): Promise<PaymentTransaction> {
    return db.paymentTransaction.update({
      where: { id },
      data: {
        status: 'SUCCESSFUL',
        providerTransactionId: fields.providerTransactionId,
        walletReference: fields.walletReference,
        completedAt: new Date(),
      },
    });
  },

  /**
   * The provider call did not come back with an answer, so we do not know if it
   * executed. PROCESSING (not FAILED, not REVERSED) is the honest state: money
   * stays where it is and the reconciler keeps asking. `UNCONFIRMED:` prefixes
   * the reason so an operator can spot these at a glance.
   */
  markUnconfirmed(id: string, reason: string, db: Db = prisma): Promise<PaymentTransaction> {
    return db.paymentTransaction.update({
      where: { id },
      data: { status: 'PROCESSING', failureReason: `UNCONFIRMED: ${reason}`.slice(0, 500) },
    });
  },

  markFailed(id: string, failureReason: string | undefined, db: Db = prisma): Promise<PaymentTransaction> {
    return db.paymentTransaction.update({
      where: { id },
      data: { status: 'FAILED', failureReason: failureReason ?? 'Payment failed', completedAt: new Date() },
    });
  },

  /** Hold a withdrawal for manual approval (funds already reserved; provider not called). */
  markHeldForApproval(id: string, db: Db = prisma): Promise<PaymentTransaction> {
    return db.paymentTransaction.update({
      where: { id },
      data: { status: 'PENDING', heldForApproval: true },
    });
  },

  /**
   * Claim a held withdrawal for one reviewer. This is a CONDITIONAL update, not
   * a plain write: the row only clears if it is still held and still PENDING,
   * so two approve clicks (or an approval racing the SLA auto-expiry) cannot
   * both go on to disburse the same payout. Returns false for the loser.
   */
  async claimApprovalHold(id: string, reviewedById: string, db: Db = prisma): Promise<boolean> {
    const claimed = await db.paymentTransaction.updateMany({
      where: { id, operation: 'WITHDRAWAL', heldForApproval: true, status: 'PENDING' },
      data: { heldForApproval: false, approvalReviewedById: reviewedById, approvalReviewedAt: new Date() },
    });
    return claimed.count === 1;
  },

  /** Withdrawals waiting on a manual approval decision, oldest first. */
  findHeldWithdrawals(limit = 100): Promise<PaymentTransaction[]> {
    return prisma.paymentTransaction.findMany({
      where: { heldForApproval: true, operation: 'WITHDRAWAL', status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  },

  /** Held withdrawals older than the SLA cutoff (candidates for auto-expiry). */
  findExpiredHolds(olderThan: Date, limit = 50): Promise<PaymentTransaction[]> {
    return prisma.paymentTransaction.findMany({
      where: {
        heldForApproval: true,
        operation: 'WITHDRAWAL',
        status: 'PENDING',
        createdAt: { lt: olderThan },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  },

  markReversed(id: string, db: Db = prisma): Promise<PaymentTransaction> {
    return db.paymentTransaction.update({
      where: { id },
      data: { status: 'REVERSED', completedAt: new Date() },
    });
  },
};
