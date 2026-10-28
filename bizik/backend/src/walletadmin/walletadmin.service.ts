import { PayoutMethod, PayoutRequest, WalletStatus } from '@prisma/client';

import { config } from '../config/env';
import { AppError } from '../lib/errors';
import { recordAudit } from '../lib/audit';
import { maskIdNumber, decryptField } from '../lib/crypto';
import { round2 } from '../lib/fees';
import { creditWallet } from '../lib/ledger';
import { humanizeMethod } from '../lib/method-format';
import * as payments from '../lib/payments';
import { PaymentProviderFactory } from '../payments/application/payment-provider.factory';
import { PaymentService } from '../payments/application/payment.service';
import { prisma } from '../lib/prisma';
import {
  PayoutFilter,
  WalletAdminRepository,
  WalletFilter,
  WalletTxFilter,
} from './walletadmin.repository';

type AdminUser = { id: string; fullName: string; email: string; status: string };

type WalletTxRecord = {
  id: string;
  reference: string | null;
  walletId: string;
  type: string;
  amount: unknown;
  currency: string;
  balanceAfter: unknown;
  referenceType: string | null;
  referenceId: string | null;
  description: string | null;
  createdAt: Date;
  wallet?: { userId: string } | null;
};

function walletTxDto(transaction: WalletTxRecord, usersById: Map<string, AdminUser>) {
  const userId = transaction.wallet?.userId ?? '';
  return {
    id: transaction.id,
    reference: transaction.reference,
    walletId: transaction.walletId,
    type: transaction.type,
    direction: Number(transaction.amount) < 0 ? 'out' : 'in',
    amount: Number(transaction.amount),
    currency: transaction.currency,
    balanceAfter: Number(transaction.balanceAfter),
    referenceType: transaction.referenceType,
    referenceId: transaction.referenceId,
    description: transaction.description ? humanizeMethod(transaction.description) : null,
    createdAt: transaction.createdAt,
    userId,
    user: personDto(userId, usersById),
  };
}

function personDto(userId: string, usersById: Map<string, AdminUser>) {
  const user = usersById.get(userId);
  return user
    ? { id: user.id, fullName: user.fullName, email: user.email, status: user.status }
    : { id: userId, fullName: 'Unknown user', email: null, status: null };
}

function methodDto(method: PayoutMethod) {
  return {
    id: method.id,
    type: method.type,
    name: method.accountName ?? method.type,
    detail: maskIdNumber(decryptField(method.accountDetail)),
    currency: method.currency,
    country: method.country,
    verified: method.verified,
    isDefault: method.isDefault,
  };
}

function payoutDto(
  payout: PayoutRequest & { payoutMethod?: PayoutMethod | null },
  usersById: Map<string, AdminUser>,
) {
  return {
    id: payout.id,
    reference: `QPY-${payout.id.replace(/\D/g, '').slice(0, 5).padStart(5, '0')}`,
    userId: payout.userId,
    user: personDto(payout.userId, usersById),
    amount: Number(payout.amount),
    feeAmount: Number(payout.feeAmount),
    currency: payout.currency,
    status: payout.status,
    isExpress: payout.isExpress,
    gateway: payout.gateway,
    gatewayRef: payout.gatewayRef,
    failureReason: payout.failureReason,
    method: payout.payoutMethod ? methodDto(payout.payoutMethod) : null,
    initiatedAt: payout.initiatedAt,
    completedAt: payout.completedAt,
  };
}

async function loadPayout(id: string) {
  const payout = await WalletAdminRepository.getPayoutById(id);
  if (!payout) throw new AppError(404, 'Q-404', 'Payout request not found');
  return payout;
}

async function payoutWithUser(payout: PayoutRequest & { payoutMethod?: PayoutMethod | null }) {
  const users = (await WalletAdminRepository.getUsersByIds([payout.userId])) as AdminUser[];
  return payoutDto(payout, new Map(users.map((user) => [user.id, user])));
}

export const WalletAdminService = {
  // ---- Wallets (wallets.view) ----
  async listWallets(
    filters: { status?: WalletStatus; currency?: string; search?: string },
    page: number,
    pageSize: number,
  ) {
    const filter: WalletFilter = {
      status: filters.status,
      currency: filters.currency as WalletFilter['currency'],
    };
    if (filters.search) {
      const matches = await WalletAdminRepository.findUserIdsBySearch(filters.search.trim());
      filter.userIds = matches.map((match) => match.id);
      if (filter.userIds.length === 0) {
        return { items: [], page, pageSize, total: 0 };
      }
    }
    const skip = (page - 1) * pageSize;
    const [wallets, total] = await Promise.all([
      WalletAdminRepository.listWallets(filter, skip, pageSize),
      WalletAdminRepository.countWallets(filter),
    ]);
    const userIds = [...new Set(wallets.map((wallet) => wallet.userId))];
    const users = (await WalletAdminRepository.getUsersByIds(userIds)) as AdminUser[];
    const usersById = new Map(users.map((user) => [user.id, user]));

    return {
      items: wallets.map((wallet) => ({
        id: wallet.id,
        userId: wallet.userId,
        user: personDto(wallet.userId, usersById),
        currency: wallet.currency,
        balance: Number(wallet.balance),
        pendingBalance: Number(wallet.pendingBalance),
        status: wallet.status,
        updatedAt: wallet.updatedAt,
        // So the row can say "1 of 6" rather than implying this is all the
        // holder has. Counted under the same filter as the row itself.
        walletCount: Number(wallet.walletCount),
      })),
      page,
      pageSize,
      total,
    };
  },

  async walletStats() {
    const [rows, holders] = await Promise.all([
      WalletAdminRepository.walletAggregates(),
      WalletAdminRepository.countHolders(),
    ]);
    return {
      totalWallets: rows.reduce((sum, row) => sum + row._count._all, 0),
      // The list is one row per holder, so without this the header would read
      // 192 next to a table of 32 and leave the operator to work out why.
      totalHolders: holders,
      byCurrency: rows.map((row) => ({
        currency: row.currency,
        balance: Number(row._sum.balance ?? 0),
        pendingBalance: Number(row._sum.pendingBalance ?? 0),
        wallets: row._count._all,
      })),
    };
  },

  async walletDetail(id: string) {
    const wallet = await WalletAdminRepository.getWalletById(id);
    if (!wallet) throw new AppError(404, 'Q-404', 'Wallet not found');
    const [users, methods, siblings] = await Promise.all([
      WalletAdminRepository.getUsersByIds([wallet.userId]) as Promise<AdminUser[]>,
      WalletAdminRepository.getPayoutMethodsByUser(wallet.userId),
      WalletAdminRepository.listWalletsByUser(wallet.userId),
    ]);
    const usersById = new Map(users.map((user) => [user.id, user]));

    return {
      id: wallet.id,
      userId: wallet.userId,
      user: personDto(wallet.userId, usersById),
      // Every wallet this holder has, so the detail page can switch between
      // them. The list only shows one of them per person now, which makes this
      // the only place the rest are reachable.
      holderWallets: siblings.map((sibling) => ({
        id: sibling.id,
        currency: sibling.currency,
        balance: Number(sibling.balance),
        pendingBalance: Number(sibling.pendingBalance),
        status: sibling.status,
      })),
      currency: wallet.currency,
      balance: Number(wallet.balance),
      pendingBalance: Number(wallet.pendingBalance),
      status: wallet.status,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
      payoutMethods: methods.map(methodDto),
      transactions: wallet.transactions.map((transaction) => ({
        id: transaction.id,
        reference: transaction.reference,
        type: transaction.type,
        amount: Number(transaction.amount),
        currency: transaction.currency,
        balanceAfter: Number(transaction.balanceAfter),
        description: transaction.description ? humanizeMethod(transaction.description) : null,
        createdAt: transaction.createdAt,
      })),
      payouts: wallet.payouts.map((payout) => payoutDto(payout, usersById)),
    };
  },

  // ---- Global wallet-transaction ledger (wallets.view) ----
  async walletTransactions(
    filters: {
      type?: WalletTxFilter['type'];
      currency?: string;
      direction?: 'in' | 'out';
      search?: string;
    },
    page: number,
    pageSize: number,
  ) {
    const filter: WalletTxFilter = {
      type: filters.type,
      currency: filters.currency as WalletTxFilter['currency'],
      direction: filters.direction,
    };
    if (filters.search) {
      const matches = await WalletAdminRepository.findUserIdsBySearch(filters.search.trim());
      filter.userIds = matches.map((match) => match.id);
      if (filter.userIds.length === 0) {
        return { items: [], page, pageSize, total: 0 };
      }
    }
    const skip = (page - 1) * pageSize;
    const [transactions, total] = await Promise.all([
      WalletAdminRepository.listWalletTransactions(filter, skip, pageSize),
      WalletAdminRepository.countWalletTransactions(filter),
    ]);
    const userIds = [...new Set(transactions.map((transaction) => transaction.wallet?.userId ?? ''))];
    const users = (await WalletAdminRepository.getUsersByIds(userIds)) as AdminUser[];
    const usersById = new Map(users.map((user) => [user.id, user]));

    return {
      items: transactions.map((transaction) => walletTxDto(transaction, usersById)),
      page,
      pageSize,
      total,
    };
  },

  async walletTransactionDetail(id: string) {
    const transaction = await WalletAdminRepository.getWalletTransactionById(id);
    if (!transaction) throw new AppError(404, 'Q-404', 'Transaction not found');
    const userId = transaction.wallet?.userId ?? '';
    const users = (await WalletAdminRepository.getUsersByIds([userId])) as AdminUser[];
    const usersById = new Map(users.map((user) => [user.id, user]));
    return {
      ...walletTxDto(transaction, usersById),
      wallet: transaction.wallet
        ? {
            id: transaction.wallet.id,
            currency: transaction.wallet.currency,
            status: transaction.wallet.status,
          }
        : null,
    };
  },

  // ---- Payout queue (payouts.view) ----
  async listPayouts(
    filters: { status?: PayoutFilter['status']; currency?: string; search?: string },
    page: number,
    pageSize: number,
  ) {
    const skip = (page - 1) * pageSize;
    const filter: PayoutFilter = {
      status: filters.status,
      currency: filters.currency as PayoutFilter['currency'],
    };
    const [payouts, total] = await Promise.all([
      WalletAdminRepository.listPayouts(filter, skip, pageSize),
      WalletAdminRepository.countPayouts(filter),
    ]);
    const userIds = [...new Set(payouts.map((payout) => payout.userId))];
    const users = (await WalletAdminRepository.getUsersByIds(userIds)) as AdminUser[];
    const usersById = new Map(users.map((user) => [user.id, user]));

    let items = payouts.map((payout) => payoutDto(payout, usersById));
    if (filters.search) {
      const needle = filters.search.trim().toLowerCase();
      items = items.filter((item) =>
        `${item.user.fullName} ${item.user.email ?? ''}`.toLowerCase().includes(needle),
      );
    }
    return { items, page, pageSize, total };
  },

  async payoutStats() {
    const rows = await WalletAdminRepository.payoutStatusCounts();
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.status] = row._count._all;
    return {
      total: rows.reduce((sum, row) => sum + row._count._all, 0),
      pending: (counts.INITIATED ?? 0) + (counts.PROCESSING ?? 0),
      onHold: counts.ON_HOLD ?? 0,
      completed: counts.COMPLETED ?? 0,
      failed: counts.FAILED ?? 0,
    };
  },

  // ---- Payout actions (payouts.manage) ----

  /** Approve a pending payout - disburses via the gateway and completes it. */
  async approve(adminId: string, id: string) {
    const payout = await loadPayout(id);
    if (!['INITIATED', 'PROCESSING', 'ON_HOLD'].includes(payout.status)) {
      throw new AppError(409, 'Q-409', 'This payout is not awaiting approval.');
    }
    // `payments.payout` is the legacy SIMULATED gateway: it always reports
    // success and sends nothing. Completing a payout with it in live mode would
    // tell the operator (and the user) that money went out when it did not.
    if (config.payments.mode === 'live') {
      throw new AppError(
        400,
        'Q-400',
        'This legacy payout queue cannot disburse live money. Approve it from the withdrawals queue instead.',
      );
    }
    const disburse = round2(Number(payout.amount) - Number(payout.feeAmount));
    const result = await payments.payout({ amount: disburse, currency: payout.currency });
    const updated = await WalletAdminRepository.updatePayout(id, {
      status: 'COMPLETED',
      gateway: result.gateway,
      gatewayRef: result.gatewayRef,
      failureReason: null,
      completedAt: new Date(),
    });
    void recordAudit({
      actorId: adminId,
      action: 'payout.approve',
      entityType: 'PayoutRequest',
      entityId: id,
      before: { status: payout.status },
      after: { status: 'COMPLETED', gatewayRef: result.gatewayRef },
    });
    return payoutWithUser(updated);
  },

  /** Put a payout on hold pending further review. */
  async hold(adminId: string, id: string) {
    const payout = await loadPayout(id);
    if (!['INITIATED', 'PROCESSING'].includes(payout.status)) {
      throw new AppError(409, 'Q-409', 'Only pending payouts can be held.');
    }
    const updated = await WalletAdminRepository.updatePayout(id, { status: 'ON_HOLD' });
    void recordAudit({
      actorId: adminId,
      action: 'payout.hold',
      entityType: 'PayoutRequest',
      entityId: id,
      before: { status: payout.status },
      after: { status: 'ON_HOLD' },
    });
    return payoutWithUser(updated);
  },

  /** Retry a failed payout by re-attempting the disbursement. */
  async retry(adminId: string, id: string) {
    const payout = await loadPayout(id);
    if (payout.status !== 'FAILED') {
      throw new AppError(409, 'Q-409', 'Only failed payouts can be retried.');
    }
    // `payments.payout` is the legacy SIMULATED gateway: it always reports
    // success and sends nothing. Completing a payout with it in live mode would
    // tell the operator (and the user) that money went out when it did not.
    if (config.payments.mode === 'live') {
      throw new AppError(
        400,
        'Q-400',
        'This legacy payout queue cannot disburse live money. Approve it from the withdrawals queue instead.',
      );
    }
    const disburse = round2(Number(payout.amount) - Number(payout.feeAmount));
    const result = await payments.payout({ amount: disburse, currency: payout.currency });
    const updated = await WalletAdminRepository.updatePayout(id, {
      status: 'COMPLETED',
      gateway: result.gateway,
      gatewayRef: result.gatewayRef,
      failureReason: null,
      completedAt: new Date(),
    });
    void recordAudit({
      actorId: adminId,
      action: 'payout.retry',
      entityType: 'PayoutRequest',
      entityId: id,
      before: { status: payout.status },
      after: { status: 'COMPLETED', gatewayRef: result.gatewayRef },
    });
    return payoutWithUser(updated);
  },

  /** Reject a payout - fails it and refunds the amount back to the wallet. */
  async reject(adminId: string, id: string, reason: string) {
    const payout = await loadPayout(id);
    if (['COMPLETED', 'FAILED'].includes(payout.status)) {
      throw new AppError(409, 'Q-409', 'This payout is already closed.');
    }
    await prisma.$transaction(async (tx) => {
      await creditWallet(tx, {
        userId: payout.userId,
        currency: payout.currency,
        amount: Number(payout.amount),
        type: 'REFUND',
        referenceType: 'payout',
        referenceId: payout.id,
        description: 'Payout rejected - refunded to wallet',
      });
      await tx.payoutRequest.update({
        where: { id },
        data: { status: 'FAILED', failureReason: reason },
      });
    });
    void recordAudit({
      actorId: adminId,
      action: 'payout.reject',
      entityType: 'PayoutRequest',
      entityId: id,
      before: { status: payout.status },
      after: { status: 'FAILED', reason, refunded: Number(payout.amount) },
    });
    return payoutWithUser(await loadPayout(id));
  },

  // ---- CEMAC large mobile-money withdrawal approval holds (payments module) ----

  /** Withdrawals held for manual approval, with the requesting user attached. */
  async listWithdrawalHolds() {
    const holds = await PaymentService.listHeldWithdrawals();
    const userIds = [...new Set(holds.map((hold) => hold.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true, email: true, status: true },
    });
    const usersById = new Map<string, AdminUser>(users.map((user) => [user.id, user as AdminUser]));
    return holds.map((hold) => ({
      id: hold.id,
      reference: hold.transactionReference,
      provider: hold.provider,
      amount: Number(hold.amount),
      currency: hold.currency,
      phoneNumber: hold.phoneNumber,
      createdAt: hold.createdAt,
      user: personDto(hold.userId, usersById),
    }));
  },

  async approveWithdrawalHold(adminId: string, id: string) {
    const updated = await PaymentService.approveWithdrawal(adminId, id);
    void recordAudit({
      actorId: adminId,
      action: 'payment.withdrawal.approve',
      entityType: 'PaymentTransaction',
      entityId: id,
      after: { status: updated.status, reference: updated.transactionReference },
    });
    return updated;
  },

  /**
   * Record a withdrawal the operator paid by hand (Fapshi dashboard, mobile
   * money, bank transfer). Used while Fapshi payouts are not yet activated for
   * this account, and for any rail that has no automatic disbursement.
   */
  async markWithdrawalPaid(adminId: string, id: string, reference: string) {
    const updated = await PaymentService.settleWithdrawalManually(adminId, id, reference);
    void recordAudit({
      actorId: adminId,
      action: 'payment.withdrawal.mark_paid',
      entityType: 'PaymentTransaction',
      entityId: id,
      after: { status: updated.status, reference, paidOutsidePlatform: true },
    });
    return updated;
  },

  /** Balance of the Fapshi disbursement service, shown on the payout queue. */
  async payoutRailStatus() {
    const automatic = PaymentProviderFactory.canDisburse('MTN_MOBILE_MONEY');
    if (!automatic) {
      return { automatic, balance: null, currency: null, reason: 'No disbursement service configured' };
    }
    try {
      const balance = await PaymentProviderFactory.payoutBalance();
      return { automatic, ...balance, reason: null };
    } catch (error) {
      return { automatic, balance: null, currency: null, reason: (error as Error).message };
    }
  },

  async rejectWithdrawalHold(adminId: string, id: string, reason?: string) {
    const updated = await PaymentService.rejectWithdrawal(adminId, id, reason);
    void recordAudit({
      actorId: adminId,
      action: 'payment.withdrawal.reject',
      entityType: 'PaymentTransaction',
      entityId: id,
      after: { status: updated.status, reason: reason ?? null },
    });
    return updated;
  },
};
