import { prisma } from '../lib/prisma';

const ACTIVE_CONTRACT = ['SIGNED', 'FUNDED', 'IN_PROGRESS', 'IN_REVIEW'] as const;
const OPEN_DISPUTE = ['FILED', 'AWAITING_RESPONSE', 'UNDER_REVIEW', 'ESCALATED'] as const;
const PENDING_PAYOUT = ['INITIATED', 'ON_HOLD'] as const;
const ESCROW_MILESTONE = ['FUNDED', 'ACTIVE', 'SUBMITTED'] as const;

const range = (from: Date, to: Date) => ({ createdAt: { gte: from, lt: to } });

/** Counts + aggregates for the admin dashboard (SRS FR-ADM-000). */
export const DashboardRepository = {
  // ---- Attention queues ----
  kycPending() {
    return prisma.kycRecord.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } });
  },
  amlOpen() {
    return prisma.amlAlert.count({ where: { status: { in: ['NEW', 'UNDER_REVIEW', 'ESCALATED'] } } });
  },
  disputesOpen() {
    return prisma.dispute.count({ where: { status: { in: [...OPEN_DISPUTE] } } });
  },

  // ---- KPI aggregates ----
  activeProjects() {
    return prisma.contract.count({ where: { status: { in: [...ACTIVE_CONTRACT] } } });
  },
  newContracts(from: Date, to: Date) {
    return prisma.contract.count({ where: range(from, to) });
  },
  fundedMilestones() {
    return prisma.milestone.count({ where: { status: { in: [...ESCROW_MILESTONE] } } });
  },
  heldByCurrency() {
    return prisma.escrowAccount.groupBy({
      by: ['currency'],
      where: { status: { in: ['OPEN', 'PARTIALLY_RELEASED', 'FROZEN'] } },
      _sum: { heldAmount: true },
    });
  },
  pendingPayouts() {
    return prisma.payoutRequest.groupBy({
      by: ['currency'],
      where: { status: { in: [...PENDING_PAYOUT] } },
      _sum: { amount: true },
      _count: { _all: true },
    });
  },
  countNewUsers(from: Date, to: Date) {
    return prisma.user.count({ where: range(from, to) });
  },

  // ---- Chart source rows ----
  releasesBetween(from: Date, to: Date) {
    return prisma.escrowTransaction.findMany({
      where: { type: 'RELEASE', status: 'COMPLETED', ...range(from, to) },
      select: { amount: true, currency: true, createdAt: true },
    });
  },
  releasedSumByCurrency(from: Date, to: Date) {
    return prisma.escrowTransaction.groupBy({
      by: ['currency'],
      where: { type: 'RELEASE', status: 'COMPLETED', ...range(from, to) },
      _sum: { amount: true },
    });
  },
  usersBetween(from: Date, to: Date) {
    return prisma.user.findMany({ where: range(from, to), select: { createdAt: true } });
  },

  // ---- Recent activity ----
  recentAudit(take = 8) {
    return prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take });
  },
  usersByIds(ids: string[]) {
    return prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true },
    });
  },
};
