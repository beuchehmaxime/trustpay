import { Currency, EscrowAccountStatus, EscrowTxType, Prisma, TxStatus } from '@prisma/client';

import { prisma } from '../lib/prisma';

export interface AccountFilter {
  status?: EscrowAccountStatus;
  currency?: Currency;
  search?: string;
}

export interface LedgerFilter {
  type?: EscrowTxType;
  status?: TxStatus;
  currency?: Currency;
}

function accountWhere(filter: AccountFilter): Prisma.EscrowAccountWhereInput {
  const search = filter.search?.trim();
  return {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.currency ? { currency: filter.currency } : {}),
    ...(search
      ? {
          OR: [
            { contractId: { contains: search, mode: 'insensitive' } },
            { subAccountRef: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

/** Reads/writes for the admin Escrow & transactions console (SRS MOD-07). */
export const EscrowAdminRepository = {
  listAccounts(filter: AccountFilter, skip: number, take: number) {
    return prisma.escrowAccount.findMany({
      where: accountWhere(filter),
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { transactions: true, refunds: true } } },
      skip,
      take,
    });
  },

  countAccounts(filter: AccountFilter) {
    return prisma.escrowAccount.count({ where: accountWhere(filter) });
  },

  /** Held/released/refunded totals grouped by currency for the KPI header. */
  aggregatesByCurrency() {
    return prisma.escrowAccount.groupBy({
      by: ['currency'],
      _sum: { heldAmount: true, releasedAmount: true, refundedAmount: true },
      _count: { _all: true },
    });
  },

  statusCounts() {
    return prisma.escrowAccount.groupBy({ by: ['status'], _count: { _all: true } });
  },

  getAccountById(id: string) {
    return prisma.escrowAccount.findUnique({
      where: { id },
      include: {
        transactions: { orderBy: { createdAt: 'desc' } },
        refunds: { orderBy: { createdAt: 'desc' } },
        fees: { orderBy: { createdAt: 'desc' } },
      },
    });
  },

  getContractWithMilestones(contractId: string) {
    return prisma.contract.findUnique({
      where: { id: contractId },
      include: { milestones: { orderBy: { order: 'asc' } } },
    });
  },

  updateAccount(id: string, data: Prisma.EscrowAccountUncheckedUpdateInput) {
    return prisma.escrowAccount.update({ where: { id }, data });
  },

  createTransaction(data: Prisma.EscrowTransactionUncheckedCreateInput) {
    return prisma.escrowTransaction.create({ data });
  },

  // ---- Global transaction ledger ----
  listTransactions(filter: LedgerFilter, skip: number, take: number) {
    return prisma.escrowTransaction.findMany({
      where: {
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.currency ? { currency: filter.currency } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { escrowAccount: { select: { contractId: true } } },
      skip,
      take,
    });
  },

  countTransactions(filter: LedgerFilter) {
    return prisma.escrowTransaction.count({
      where: {
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.currency ? { currency: filter.currency } : {}),
      },
    });
  },

  /** Single ledger transaction with its escrow account (for the detail view). */
  getTransactionById(id: string) {
    return prisma.escrowTransaction.findUnique({
      where: { id },
      include: { escrowAccount: true },
    });
  },

  getMilestoneById(id: string) {
    return prisma.milestone.findUnique({
      where: { id },
      select: { id: true, order: true, title: true, amount: true, currency: true, status: true },
    });
  },

  // ---- Cross-context contract/user lookups (soft FK) ----
  getContractsByIds(ids: string[]) {
    return prisma.contract.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true, status: true, creatorId: true, counterpartyName: true },
    });
  },

  getUsersByIds(ids: string[]) {
    return prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true },
    });
  },
};
