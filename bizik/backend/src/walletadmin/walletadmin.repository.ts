import { Currency, PayoutStatus, Prisma, WalletStatus, WalletTxType } from '@prisma/client';

import { prisma } from '../lib/prisma';

/** Payout statuses that still need an operator decision. */
export const OPEN_PAYOUT_STATUSES: PayoutStatus[] = ['INITIATED', 'PROCESSING', 'ON_HOLD'];

export interface WalletFilter {
  status?: WalletStatus;
  currency?: Currency;
  userIds?: string[];
}

export interface PayoutFilter {
  status?: PayoutStatus;
  currency?: Currency;
}

export interface WalletTxFilter {
  type?: WalletTxType;
  currency?: Currency;
  /** 'in' = credits (amount > 0), 'out' = debits (amount < 0). */
  direction?: 'in' | 'out';
  userIds?: string[];
}

function walletTxWhere(filter: WalletTxFilter): Prisma.WalletTransactionWhereInput {
  return {
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.currency ? { currency: filter.currency } : {}),
    ...(filter.direction === 'in' ? { amount: { gt: 0 } } : {}),
    ...(filter.direction === 'out' ? { amount: { lt: 0 } } : {}),
    ...(filter.userIds ? { wallet: { userId: { in: filter.userIds } } } : {}),
  };
}

/** One row per holder: the wallet that stands for that user in the list. */
export interface HolderWalletRow {
  id: string;
  userId: string;
  currency: Currency;
  balance: Prisma.Decimal;
  pendingBalance: Prisma.Decimal;
  status: WalletStatus;
  updatedAt: Date;
  /** How many wallets this holder has that match the current filter. */
  walletCount: bigint;
}

/**
 * The SQL fragments that pick one wallet per holder, shared by the list and its
 * count so the two can never disagree about which rows exist.
 */
function holderWalletFilter(filter: WalletFilter): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (filter.status) conditions.push(Prisma.sql`w."status" = ${filter.status}::"WalletStatus"`);
  if (filter.currency) conditions.push(Prisma.sql`w."currency" = ${filter.currency}::"Currency"`);
  if (filter.userIds) conditions.push(Prisma.sql`w."userId" = ANY(${filter.userIds}::text[])`);
  return Prisma.join(conditions, ' AND ');
}

/** Reads/writes for the admin Wallets & payouts console (SRS MOD-08). */
export const WalletAdminRepository = {
  // ---- Wallets ----
  /**
   * One row per holder rather than one per wallet.
   *
   * Every user is given a wallet in each supported currency the moment they
   * sign up, so a straight wallet list repeated the same person six times and
   * a page of twenty rows held three people. The list is for finding a holder;
   * their individual currencies belong on the detail page.
   *
   * Which wallet represents the holder: the one with the most money in it, and
   * where nothing has any money - which is most of them - the one created
   * first. Money is what an operator opening this page is looking for, so a
   * funded wallet must never be the one hidden behind a zero.
   *
   * Done with DISTINCT ON rather than by grouping in TypeScript because the
   * list is paginated server-side. Collapsing after the fact would mean asking
   * for twenty rows, showing four, and reporting a total that counts wallets
   * while the table counts people.
   */
  async listWallets(filter: WalletFilter, skip: number, take: number) {
    const where = holderWalletFilter(filter);
    return prisma.$queryRaw<HolderWalletRow[]>`
      SELECT DISTINCT ON (w."userId")
        w."id",
        w."userId",
        w."currency",
        w."balance",
        w."pendingBalance",
        w."status",
        w."updatedAt",
        COUNT(*) OVER (PARTITION BY w."userId") AS "walletCount"
      FROM "wallets" w
      WHERE ${where}
      -- DISTINCT ON keeps the first row per userId, so this ORDER BY is what
      -- chooses the representative: most money first, oldest wallet to break
      -- the tie, id last so the choice is stable across requests.
      ORDER BY w."userId", w."balance" DESC, w."createdAt" ASC, w."id" ASC
      OFFSET ${skip}
      LIMIT ${take}
    `;
  },

  /** Holders matching the filter - the unit the list is paginated in. */
  async countWallets(filter: WalletFilter) {
    const where = holderWalletFilter(filter);
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT w."userId") AS "count" FROM "wallets" w WHERE ${where}
    `;
    return Number(rows[0]?.count ?? 0);
  },

  walletAggregates() {
    return prisma.wallet.groupBy({
      by: ['currency'],
      _sum: { balance: true, pendingBalance: true },
      _count: { _all: true },
    });
  },

  /** Distinct holders across all wallets, for the stats header. */
  async countHolders() {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT "userId") AS "count" FROM "wallets"
    `;
    return Number(rows[0]?.count ?? 0);
  },

  getWalletById(id: string) {
    return prisma.wallet.findUnique({
      where: { id },
      include: {
        transactions: { orderBy: { createdAt: 'desc' }, take: 50 },
        payouts: { orderBy: { initiatedAt: 'desc' } },
      },
    });
  },

  /**
   * Every wallet this holder has, for the currency switcher on the detail page.
   * Ordered the way the switcher reads: funded wallets first, then by currency
   * so the row order does not shuffle as balances move.
   */
  listWalletsByUser(userId: string) {
    return prisma.wallet.findMany({
      where: { userId },
      orderBy: [{ balance: 'desc' }, { currency: 'asc' }],
      select: {
        id: true,
        currency: true,
        balance: true,
        pendingBalance: true,
        status: true,
      },
    });
  },

  getPayoutMethodsByUser(userId: string) {
    return prisma.payoutMethod.findMany({ where: { userId }, orderBy: { isDefault: 'desc' } });
  },

  // ---- Global wallet-transaction ledger (deposits, withdrawals, holds, fees…) ----
  listWalletTransactions(filter: WalletTxFilter, skip: number, take: number) {
    return prisma.walletTransaction.findMany({
      where: walletTxWhere(filter),
      orderBy: { createdAt: 'desc' },
      include: { wallet: { select: { userId: true, currency: true, status: true } } },
      skip,
      take,
    });
  },

  countWalletTransactions(filter: WalletTxFilter) {
    return prisma.walletTransaction.count({ where: walletTxWhere(filter) });
  },

  getWalletTransactionById(id: string) {
    return prisma.walletTransaction.findUnique({
      where: { id },
      include: { wallet: { select: { id: true, userId: true, currency: true, status: true } } },
    });
  },

  // ---- Payouts ----
  listPayouts(filter: PayoutFilter, skip: number, take: number) {
    return prisma.payoutRequest.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.currency ? { currency: filter.currency } : {}),
      },
      orderBy: { initiatedAt: 'desc' },
      include: { payoutMethod: true },
      skip,
      take,
    });
  },

  countPayouts(filter: PayoutFilter) {
    return prisma.payoutRequest.count({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.currency ? { currency: filter.currency } : {}),
      },
    });
  },

  payoutStatusCounts() {
    return prisma.payoutRequest.groupBy({ by: ['status'], _count: { _all: true } });
  },

  getPayoutById(id: string) {
    return prisma.payoutRequest.findUnique({ where: { id }, include: { payoutMethod: true } });
  },

  updatePayout(id: string, data: Prisma.PayoutRequestUncheckedUpdateInput) {
    return prisma.payoutRequest.update({ where: { id }, data });
  },

  // ---- Cross-context user lookups (soft FK) ----
  getUsersByIds(ids: string[]) {
    return prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true, email: true, status: true },
    });
  },

  findUserIdsBySearch(search: string) {
    return prisma.user.findMany({
      where: {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
      take: 100,
    });
  },
};
