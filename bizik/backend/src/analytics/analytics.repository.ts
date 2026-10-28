import { prisma } from '../lib/prisma';

const OPEN_DISPUTE = ['FILED', 'AWAITING_RESPONSE', 'UNDER_REVIEW', 'ESCALATED'] as const;
const ACTIVE_CONTRACT = ['SIGNED', 'FUNDED', 'IN_PROGRESS', 'IN_REVIEW'] as const;

const range = (from: Date, to: Date) => ({ createdAt: { gte: from, lt: to } });

/** Aggregations for the admin Reports & analytics module (SRS MOD-12). */
export const AnalyticsRepository = {
  // ---- Range aggregates (grouped, USD-converted in the service) ----
  releasedByCurrency(from: Date, to: Date) {
    return prisma.escrowTransaction.groupBy({
      by: ['currency'],
      where: { type: 'RELEASE', status: 'COMPLETED', ...range(from, to) },
      _sum: { amount: true },
      _count: { _all: true },
    });
  },

  feesByCurrency(from: Date, to: Date) {
    return prisma.feeRecord.groupBy({
      by: ['currency'],
      where: range(from, to),
      _sum: { amount: true },
    });
  },

  feesByTypeCurrency(from: Date, to: Date) {
    return prisma.feeRecord.groupBy({
      by: ['type', 'currency'],
      where: range(from, to),
      _sum: { amount: true },
    });
  },

  countTransactions(from: Date, to: Date) {
    return prisma.escrowTransaction.count({ where: range(from, to) });
  },

  countNewUsers(from: Date, to: Date) {
    return prisma.user.count({ where: range(from, to) });
  },

  countDisputes(from: Date, to: Date) {
    return prisma.dispute.count({ where: range(from, to) });
  },

  countContracts(from: Date, to: Date) {
    return prisma.contract.count({ where: range(from, to) });
  },

  // ---- Windowed rows for trend buckets ----
  releasesBetween(from: Date, to: Date) {
    return prisma.escrowTransaction.findMany({
      where: { type: 'RELEASE', status: 'COMPLETED', ...range(from, to) },
      select: { amount: true, currency: true, createdAt: true },
    });
  },

  feesBetween(from: Date, to: Date) {
    return prisma.feeRecord.findMany({
      where: range(from, to),
      select: { amount: true, currency: true, createdAt: true },
    });
  },

  usersBetween(from: Date, to: Date) {
    return prisma.user.findMany({ where: range(from, to), select: { createdAt: true } });
  },

  txnsBetween(from: Date, to: Date) {
    return prisma.escrowTransaction.findMany({ where: range(from, to), select: { createdAt: true } });
  },

  // ---- Current-state snapshots (not range-based) ----
  contractsByStatus() {
    return prisma.contract.groupBy({ by: ['status'], _count: { _all: true } });
  },

  usersByTier() {
    return prisma.user.groupBy({ by: ['kycTier'], _count: { _all: true } });
  },

  heldByCurrency() {
    return prisma.escrowAccount.groupBy({ by: ['currency'], _sum: { heldAmount: true } });
  },

  async liveCounts() {
    const [activeProjects, openDisputes] = await Promise.all([
      prisma.contract.count({ where: { status: { in: [...ACTIVE_CONTRACT] } } }),
      prisma.dispute.count({ where: { status: { in: [...OPEN_DISPUTE] } } }),
    ]);
    return { activeProjects, openDisputes };
  },

  // ---- Report data sources ----
  transactionsInPeriod(since: Date) {
    return prisma.escrowTransaction.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      include: { escrowAccount: { select: { contractId: true } } },
    });
  },

  feesInPeriod(since: Date) {
    return prisma.feeRecord.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });
  },

  amlAlertsAll() {
    return prisma.amlAlert.findMany({ orderBy: { createdAt: 'desc' } });
  },

  kycRecordsAll() {
    return prisma.kycRecord.findMany({
      select: { status: true, tier: true, provider: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  },

  createReport(data: {
    type: import('@prisma/client').ReportType;
    generatedById: string;
    periodStart?: Date;
    periodEnd?: Date;
  }) {
    return prisma.report.create({
      data: {
        type: data.type,
        generatedById: data.generatedById,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        format: 'CSV',
        status: 'COMPLETED',
      },
    });
  },

  recentReports() {
    return prisma.report.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
  },

  getUsersByIds(ids: string[]) {
    return prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true },
    });
  },
};
