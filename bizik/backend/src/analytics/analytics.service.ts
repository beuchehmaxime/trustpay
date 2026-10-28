import { Currency, Prisma, ReportType } from '@prisma/client';

import { AppError } from '../lib/errors';
import { recordAudit } from '../lib/audit';
import { usdRateOf } from '../lib/settings';
import { AnalyticsRepository } from './analytics.repository';

const DAY = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const toUsd = (amount: number, currency: Currency) =>
  Math.round(amount * usdRateOf(currency) * 100) / 100;

const round = (value: number) => Math.round(value * 100) / 100;

const FEE_LABEL: Record<string, string> = {
  CLIENT_SERVICE_FEE: 'Client service fee',
  FREELANCER_FEE: 'Freelancer fee',
  EXPRESS_WITHDRAWAL: 'Express withdrawal',
  FX_MARGIN: 'FX margin',
  DISPUTE_FEE: 'Dispute fee',
};

type CurrencySum = { currency: Currency; _sum: { amount: Prisma.Decimal | null } };

const sumUsd = (rows: CurrencySum[]) =>
  rows.reduce((total, row) => total + toUsd(Number(row._sum.amount ?? 0), row.currency), 0);

/** Percentage change vs a previous value (100% if growing from zero). */
function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return round(((current - previous) / previous) * 100);
}

/**
 * Bucket a range by a real calendar unit (hour / day / month) so labels never
 * duplicate. Buckets are aligned to unit boundaries between `from` and `to`.
 */
function makeBuckets(from: Date, to: Date) {
  const span = to.getTime() - from.getTime();
  const unit: 'hour' | 'day' | 'month' =
    span <= 2 * DAY ? 'hour' : span <= 45 * DAY ? 'day' : 'month';

  const keyOf = (date: Date) => {
    const parts = [date.getUTCFullYear(), date.getUTCMonth()];
    if (unit !== 'month') parts.push(date.getUTCDate());
    if (unit === 'hour') parts.push(date.getUTCHours());
    return parts.join('-');
  };
  const labelOf = (date: Date) => {
    if (unit === 'month') return MONTHS[date.getUTCMonth()];
    if (unit === 'day') return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
    return `${String(date.getUTCHours()).padStart(2, '0')}:00`;
  };
  const truncate = (date: Date) => {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    if (unit === 'month') return new Date(Date.UTC(year, month, 1));
    if (unit === 'day') return new Date(Date.UTC(year, month, date.getUTCDate()));
    return new Date(Date.UTC(year, month, date.getUTCDate(), date.getUTCHours()));
  };
  const step = (date: Date) => {
    const next = new Date(date);
    if (unit === 'month') next.setUTCMonth(next.getUTCMonth() + 1);
    else if (unit === 'day') next.setUTCDate(next.getUTCDate() + 1);
    else next.setUTCHours(next.getUTCHours() + 1);
    return next;
  };

  const buckets: { label: string; value: number }[] = [];
  const keyToIndex = new Map<string, number>();
  let cursor = truncate(from);
  let guard = 0;
  while (cursor.getTime() <= to.getTime() && guard < 800) {
    keyToIndex.set(keyOf(cursor), buckets.length);
    buckets.push({ label: labelOf(cursor), value: 0 });
    cursor = step(cursor);
    guard += 1;
  }
  const indexOf = (date: Date) => keyToIndex.get(keyOf(date)) ?? -1;
  return { buckets, indexOf };
}

export const AnalyticsService = {
  /** Range-aware GMV / revenue / volume analytics with period deltas (reports.view). */
  async overview(from: Date, to: Date) {
    const span = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - span);
    const prevTo = from;

    const [
      releasedCur,
      feesCur,
      feesByType,
      txnCur,
      userCur,
      disputeCur,
      contractCur,
      releasedPrev,
      feesPrev,
      txnPrev,
      userPrev,
      disputePrev,
      contractPrev,
      releaseRows,
      feeRows,
      userRows,
      txnRows,
      byStatus,
      byTier,
      live,
    ] = await Promise.all([
      AnalyticsRepository.releasedByCurrency(from, to),
      AnalyticsRepository.feesByCurrency(from, to),
      AnalyticsRepository.feesByTypeCurrency(from, to),
      AnalyticsRepository.countTransactions(from, to),
      AnalyticsRepository.countNewUsers(from, to),
      AnalyticsRepository.countDisputes(from, to),
      AnalyticsRepository.countContracts(from, to),
      AnalyticsRepository.releasedByCurrency(prevFrom, prevTo),
      AnalyticsRepository.feesByCurrency(prevFrom, prevTo),
      AnalyticsRepository.countTransactions(prevFrom, prevTo),
      AnalyticsRepository.countNewUsers(prevFrom, prevTo),
      AnalyticsRepository.countDisputes(prevFrom, prevTo),
      AnalyticsRepository.countContracts(prevFrom, prevTo),
      AnalyticsRepository.releasesBetween(from, to),
      AnalyticsRepository.feesBetween(from, to),
      AnalyticsRepository.usersBetween(from, to),
      AnalyticsRepository.txnsBetween(from, to),
      AnalyticsRepository.contractsByStatus(),
      AnalyticsRepository.usersByTier(),
      AnalyticsRepository.liveCounts(),
    ]);

    const gmvUsd = round(sumUsd(releasedCur));
    const revenueUsd = round(sumUsd(feesCur));
    const gmvPrev = round(sumUsd(releasedPrev));
    const revenuePrev = round(sumUsd(feesPrev));
    const disputeRate = round((disputeCur / Math.max(1, contractCur)) * 100);
    const disputeRatePrev = round((disputePrev / Math.max(1, contractPrev)) * 100);

    // Trend buckets over the selected range.
    const gmv = makeBuckets(from, to);
    const revenue = makeBuckets(from, to);
    const users = makeBuckets(from, to);
    const transactions = makeBuckets(from, to);
    const addTo = (buckets: { value: number }[], index: number, amount: number) => {
      if (index >= 0) buckets[index].value += amount;
    };
    for (const row of releaseRows)
      addTo(gmv.buckets, gmv.indexOf(row.createdAt), toUsd(Number(row.amount), row.currency));
    for (const row of feeRows)
      addTo(revenue.buckets, revenue.indexOf(row.createdAt), toUsd(Number(row.amount), row.currency));
    for (const row of userRows) addTo(users.buckets, users.indexOf(row.createdAt), 1);
    for (const row of txnRows) addTo(transactions.buckets, transactions.indexOf(row.createdAt), 1);
    const clean = (points: { label: string; value: number }[]) =>
      points.map((point) => ({ label: point.label, value: round(point.value) }));

    // Breakdowns (revenue/gmv scoped to range; projects/users are current state).
    const revenueTypeMap = new Map<string, number>();
    for (const row of feesByType) {
      const usd = toUsd(Number(row._sum.amount ?? 0), row.currency);
      revenueTypeMap.set(row.type, (revenueTypeMap.get(row.type) ?? 0) + usd);
    }

    return {
      kpis: {
        gmv: { value: gmvUsd, delta: pctChange(gmvUsd, gmvPrev), deltaUnit: 'pct' },
        revenue: { value: revenueUsd, delta: pctChange(revenueUsd, revenuePrev), deltaUnit: 'pct' },
        transactions: { value: txnCur, delta: pctChange(txnCur, txnPrev), deltaUnit: 'pct' },
        newUsers: { value: userCur, delta: pctChange(userCur, userPrev), deltaUnit: 'pct' },
        disputeRate: {
          value: disputeRate,
          delta: round(disputeRate - disputeRatePrev),
          deltaUnit: 'pts',
        },
      },
      live,
      trends: {
        gmv: clean(gmv.buckets),
        revenue: clean(revenue.buckets),
        users: clean(users.buckets),
        transactions: clean(transactions.buckets),
      },
      breakdowns: {
        revenueByType: [...revenueTypeMap.entries()]
          .map(([type, usd]) => ({ type, label: FEE_LABEL[type] ?? type, usd: round(usd) }))
          .sort((first, second) => second.usd - first.usd),
        gmvByCurrency: releasedCur.map((row) => ({
          currency: row.currency,
          amount: Number(row._sum.amount ?? 0),
          count: row._count._all,
        })),
        projectsByStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })),
        usersByTier: byTier
          .map((row) => ({ tier: row.kycTier, count: row._count._all }))
          .sort((first, second) => first.tier - second.tier),
      },
    };
  },

  /** Recently generated reports (reports.view). */
  async reports() {
    const rows = await AnalyticsRepository.recentReports();
    const generatorIds = [...new Set(rows.map((row) => row.generatedById).filter(Boolean))] as string[];
    const usersList = await AnalyticsRepository.getUsersByIds(generatorIds);
    const nameById = new Map(usersList.map((user) => [user.id, user.fullName]));
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      format: row.format,
      status: row.status,
      generatedBy: row.generatedById ? (nameById.get(row.generatedById) ?? 'Operator') : 'System',
      createdAt: row.createdAt,
    }));
  },

  /** Generate a report as CSV, persist a Report row, and audit it (reports.export). */
  async generate(adminId: string, type: ReportType) {
    const now = new Date();
    const days = (n: number) => new Date(now.getTime() - n * DAY);
    const filename = `${type.toLowerCase()}.csv`;
    let content = '';
    let periodStart: Date | undefined;

    switch (type) {
      case 'DAILY_TRANSACTION_SUMMARY': {
        periodStart = days(30);
        const rows = await AnalyticsRepository.transactionsInPeriod(periodStart);
        content = csv(
          ['Transaction ID', 'Type', 'Amount', 'Currency', 'Status', 'Contract', 'Date'],
          rows.map((row) => [
            row.id,
            row.type,
            Number(row.amount),
            row.currency,
            row.status,
            row.escrowAccount?.contractId ?? '',
            row.createdAt.toISOString(),
          ]),
        );
        break;
      }
      case 'EARNINGS_TAX': {
        periodStart = days(365);
        const rows = await AnalyticsRepository.feesInPeriod(periodStart);
        content = csv(
          ['Fee type', 'Amount', 'Currency', 'Amount (USD)', 'Contract', 'Date'],
          rows.map((row) => [
            FEE_LABEL[row.type] ?? row.type,
            Number(row.amount),
            row.currency,
            toUsd(Number(row.amount), row.currency),
            row.contractId ?? '',
            row.createdAt.toISOString(),
          ]),
        );
        break;
      }
      case 'GMV_ANALYTICS': {
        periodStart = days(180);
        const overview = await this.overview(periodStart, now);
        content = csv(
          ['Bucket', 'GMV (USD)', 'Revenue (USD)', 'New users', 'Transactions'],
          overview.trends.gmv.map((point, index) => [
            point.label,
            point.value,
            overview.trends.revenue[index].value,
            overview.trends.users[index].value,
            overview.trends.transactions[index].value,
          ]),
        );
        break;
      }
      case 'KYC_COVERAGE': {
        const records = await AnalyticsRepository.kycRecordsAll();
        const byStatus = new Map<string, number>();
        for (const record of records) byStatus.set(record.status, (byStatus.get(record.status) ?? 0) + 1);
        content = csv(
          ['KYC status', 'Count'],
          [...byStatus.entries()].map(([status, count]) => [status, count]),
        );
        break;
      }
      case 'MONTHLY_AML':
      case 'SUSPICIOUS_ACTIVITY': {
        const alerts = await AnalyticsRepository.amlAlertsAll();
        const filtered =
          type === 'SUSPICIOUS_ACTIVITY'
            ? alerts.filter((alert) => alert.type === 'SANCTIONS_MATCH' || alert.status === 'ESCALATED')
            : alerts;
        content = csv(
          ['Alert ID', 'Type', 'Status', 'User', 'Raised'],
          filtered.map((alert) => [
            alert.id,
            alert.type,
            alert.status,
            alert.userId ?? '',
            alert.createdAt.toISOString(),
          ]),
        );
        break;
      }
      default:
        throw new AppError(400, 'Q-400', 'Unknown report type.');
    }

    const report = await AnalyticsRepository.createReport({
      type,
      generatedById: adminId,
      periodStart,
      periodEnd: now,
    });
    void recordAudit({
      actorId: adminId,
      action: 'report.generate',
      entityType: 'Report',
      entityId: report.id,
      after: { type },
    });

    return { filename, csv: content, report };
  },
};

function csv(headers: string[], rows: (string | number)[][]): string {
  const escape = (cell: string | number) => `"${String(cell).replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map((row) => row.map(escape).join(','))].join('\n');
}
