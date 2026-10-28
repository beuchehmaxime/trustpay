import { AuditLog, Currency, Prisma } from '@prisma/client';

import { AppError } from '../lib/errors';
import { usdRateOf } from '../lib/settings';
import { prisma } from '../lib/prisma';
import { DashboardRepository } from './dashboard.repository';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 24 * 60 * 60 * 1000;

const toUsd = (amount: number, currency: Currency) =>
  Math.round(amount * usdRateOf(currency) * 100) / 100;

type CurrencySum = { currency: Currency; _sum: { amount: Prisma.Decimal | null } };
type HeldSum = { currency: Currency; _sum: { heldAmount: Prisma.Decimal | null } };

const sumReleaseUsd = (rows: CurrencySum[]) =>
  rows.reduce((total, row) => total + toUsd(Number(row._sum.amount ?? 0), row.currency), 0);

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

interface OperatorScope {
  isSuperAdmin: boolean;
  permissions: string[];
}

async function scopeFor(operatorId: string): Promise<OperatorScope> {
  const operator = await prisma.user.findUnique({
    where: { id: operatorId },
    include: { adminRole: true },
  });
  if (!operator?.adminRole) {
    throw new AppError(403, 'Q-403', 'You do not have access to the admin console.');
  }
  return {
    isSuperAdmin: operator.adminRole.isSuperAdmin,
    permissions: operator.adminRole.permissions,
  };
}

/** Human-readable "target" for a recent-activity row. */
function activityTarget(log: AuditLog, nameById: Map<string, string>): string {
  if (log.entityType === 'User' && log.entityId) {
    return nameById.get(log.entityId) ?? 'a user';
  }
  const after = (log.afterState ?? {}) as Record<string, unknown>;
  if (typeof after.note === 'string' && after.note.length > 0) return after.note.slice(0, 60);
  if (log.entityId) return `${log.entityType} ${log.entityId.slice(0, 8)}`;
  return log.entityType;
}

export const DashboardService = {
  /** Everything the dashboard shows, scoped to what the operator may see. */
  async overview(operatorId: string) {
    const scope = await scopeFor(operatorId);
    const can = (perm: string) => scope.isSuperAdmin || scope.permissions.includes(perm);

    const now = new Date();
    const last30 = new Date(now.getTime() - 30 * DAY);
    const prev30 = new Date(now.getTime() - 60 * DAY);
    const last7 = new Date(now.getTime() - 7 * DAY);
    const prev7 = new Date(now.getTime() - 14 * DAY);

    const kpis: Record<string, unknown> = {};
    const queues: Record<string, number> = {};
    const charts: Record<string, unknown> = {};

    // ---- KPIs ----
    if (can('reports.view')) {
      const [current, previous] = await Promise.all([
        DashboardRepository.releasedSumByCurrency(last30, now),
        DashboardRepository.releasedSumByCurrency(prev30, last30),
      ]);
      const gmv = sumReleaseUsd(current as CurrencySum[]);
      const prevGmv = sumReleaseUsd(previous as CurrencySum[]);
      kpis.gmv = { value: gmv, delta: pctChange(gmv, prevGmv) };
    }

    if (can('escrow.view')) {
      const [held, milestones] = await Promise.all([
        DashboardRepository.heldByCurrency(),
        DashboardRepository.fundedMilestones(),
      ]);
      const fundsUsd = (held as HeldSum[]).reduce(
        (total, row) => total + toUsd(Number(row._sum.heldAmount ?? 0), row.currency),
        0,
      );
      kpis.fundsInEscrow = { value: fundsUsd, milestones };
    }

    if (can('contracts.view')) {
      const [active, thisWeek] = await Promise.all([
        DashboardRepository.activeProjects(),
        DashboardRepository.newContracts(last7, now),
      ]);
      kpis.activeProjects = { value: active, thisWeek };
    }

    if (can('payouts.view') || can('wallets.view')) {
      const grouped = await DashboardRepository.pendingPayouts();
      const count = grouped.reduce((total, row) => total + row._count._all, 0);
      const queuedUsd = grouped.reduce(
        (total, row) => total + toUsd(Number(row._sum.amount ?? 0), row.currency),
        0,
      );
      kpis.pendingPayouts = { value: count, queuedUsd };
      queues.payouts = count;
    }

    if (can('users.view')) {
      const [current, previous] = await Promise.all([
        DashboardRepository.countNewUsers(last7, now),
        DashboardRepository.countNewUsers(prev7, last7),
      ]);
      kpis.newUsers = { value: current, delta: pctChange(current, previous) };
    }

    // ---- Attention queues ----
    if (can('kyc.view')) queues.kyc = await DashboardRepository.kycPending();
    if (can('disputes.view')) queues.disputes = await DashboardRepository.disputesOpen();
    if (can('aml.view')) queues.aml = await DashboardRepository.amlOpen();

    // ---- Charts (reports.view) ----
    if (can('reports.view')) {
      charts.gmvTrend = await this.gmvTrend(now);
      charts.signups = await this.signupsTrend(now);
    }

    // ---- Recent activity (audit.view) ----
    let recentActivity: unknown[] = [];
    if (can('audit.view')) {
      const logs = await DashboardRepository.recentAudit(8);
      const ids = [
        ...new Set(
          logs.flatMap((log) => [log.actorId, log.entityType === 'User' ? log.entityId : null]).filter(Boolean),
        ),
      ] as string[];
      const users = await DashboardRepository.usersByIds(ids);
      const nameById = new Map(users.map((user) => [user.id, user.fullName]));
      recentActivity = logs.map((log) => ({
        id: log.id,
        actorName: log.actorId ? (nameById.get(log.actorId) ?? 'Operator') : 'system',
        action: log.action,
        target: activityTarget(log, nameById),
        result: log.result,
        createdAt: log.createdAt.toISOString(),
      }));
    }

    return { kpis, queues, charts, recentActivity };
  },

  /** Monthly USD release totals over the last 6 calendar months. */
  async gmvTrend(now: Date) {
    const buckets = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
      buckets.push({ year: date.getUTCFullYear(), month: date.getUTCMonth(), label: MONTHS[date.getUTCMonth()], value: 0 });
    }
    const from = new Date(Date.UTC(buckets[0].year, buckets[0].month, 1));
    const releases = await DashboardRepository.releasesBetween(from, now);
    for (const release of releases) {
      const created = release.createdAt;
      const bucket = buckets.find(
        (entry) => entry.year === created.getUTCFullYear() && entry.month === created.getUTCMonth(),
      );
      if (bucket) bucket.value += toUsd(Number(release.amount), release.currency);
    }
    return buckets.map((bucket) => ({ label: bucket.label, value: Math.round(bucket.value) }));
  },

  /** Weekly new-user counts over the last 12 weeks. */
  async signupsTrend(now: Date) {
    const buckets = [];
    for (let offset = 11; offset >= 0; offset -= 1) {
      const start = now.getTime() - (offset + 1) * 7 * DAY;
      const end = now.getTime() - offset * 7 * DAY;
      buckets.push({ start, end, label: `${offset === 0 ? 'This wk' : ''}`, value: 0 });
    }
    const from = new Date(buckets[0].start);
    const users = await DashboardRepository.usersBetween(from, now);
    for (const user of users) {
      const time = user.createdAt.getTime();
      const bucket = buckets.find((entry) => time >= entry.start && time < entry.end);
      if (bucket) bucket.value += 1;
    }
    return buckets.map((bucket, index) => ({ label: bucket.label || `W${index + 1}`, value: bucket.value }));
  },
};
