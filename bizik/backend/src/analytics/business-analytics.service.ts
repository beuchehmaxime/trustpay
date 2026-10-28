import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { usdRateOf } from '../lib/settings';

/**
 * Business analytics: the numbers a decision gets made on.
 *
 * Three principles, because analytics is where products most often lie to their
 * owners:
 *
 * **Nothing is invented.** Every figure here traces to a row. Where a metric
 * cannot be computed from data the platform actually holds, it is returned as
 * `null` with a reason attached rather than estimated, defaulted to zero, or
 * quietly omitted. A dashboard that shows 0% churn because it has no cohorts
 * yet is worse than one that says "not enough history" - somebody will act on
 * the zero.
 *
 * **Names mean what they normally mean.** Bizik earns transaction fees, not
 * subscriptions, so there is no MRR: revenue does not recur, it depends on
 * people transacting again. What is reported is monthly revenue and an
 * annualised run rate, clearly labelled, because calling fee income "MRR" in a
 * board pack is how a company talks itself into believing it has predictable
 * revenue it does not have.
 *
 * **The funnel is the point.** With few users, totals say almost nothing and
 * drop-off says almost everything. The funnel below is ordered by what has to
 * happen for the business to earn anything, and each stage reports both its own
 * conversion and the share of the original cohort still present.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** XAF is the unit of account: the market is Cameroon and fees are charged there. */
function toXaf(amountUsd: number): number {
  return amountUsd / usdRateOf('XAF');
}

export interface MetricGap {
  metric: string;
  reason: string;
  /** What would have to exist for this to become computable. */
  needs: string;
}

// ---------------------------------------------------------------------------
// Funnel
// ---------------------------------------------------------------------------

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  /** Share of the people who reached the PREVIOUS stage. */
  conversionFromPrevious: number | null;
  /** Share of everyone who entered the funnel. */
  shareOfTop: number;
  /** How many were lost between the previous stage and this one. */
  droppedFromPrevious: number;
}

/**
 * Where people stop.
 *
 * Counted over accounts rather than visits, because every stage after the first
 * requires an account to exist. Visit-level drop-off - people who looked and
 * never signed up - comes from the event stream instead, and the two are
 * reported side by side rather than forced into one chart that would be
 * comparing different populations.
 */
export async function signupFunnel(since?: Date): Promise<{
  stages: FunnelStage[];
  biggestDropOff: { from: string; to: string; lost: number } | null;
}> {
  const where = since ? Prisma.sql`WHERE u."createdAt" >= ${since}` : Prisma.empty;

  const [row] = await prisma.$queryRaw<
    {
      signedUp: bigint;
      phoneVerified: bigint;
      kycStarted: bigint;
      kycApproved: bigint;
      hasDeal: bigint;
      hasFundedDeal: bigint;
      hasMoneyMoved: bigint;
    }[]
  >`
    SELECT
      COUNT(*)::bigint AS "signedUp",
      COUNT(*) FILTER (WHERE u."phoneVerified")::bigint AS "phoneVerified",
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM kyc_records k WHERE k."userId" = u."id"
      ))::bigint AS "kycStarted",
      COUNT(*) FILTER (WHERE u."kycTier" >= 2)::bigint AS "kycApproved",
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM contracts c
        WHERE c."creatorId" = u."id" OR c."counterpartyId" = u."id"
      ))::bigint AS "hasDeal",
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM contracts c
        JOIN milestones m ON m."contractId" = c."id"
        WHERE (c."creatorId" = u."id" OR c."counterpartyId" = u."id")
          AND m."status"::text NOT IN ('PENDING', 'CANCELLED')
      ))::bigint AS "hasFundedDeal",
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM wallets w
        JOIN wallet_transactions t ON t."walletId" = w."id"
        WHERE w."userId" = u."id"
      ))::bigint AS "hasMoneyMoved"
    FROM users u
    ${where}
      ${since ? Prisma.sql`AND` : Prisma.sql`WHERE`} u."adminRoleId" IS NULL
      AND u."role"::text NOT IN ('ADMIN', 'COMPLIANCE', 'MEDIATOR')
  `;

  const raw: { key: string; label: string; count: number }[] = [
    { key: 'signed_up', label: 'Created an account', count: Number(row.signedUp) },
    { key: 'phone_verified', label: 'Proved their phone', count: Number(row.phoneVerified) },
    { key: 'kyc_started', label: 'Started verification', count: Number(row.kycStarted) },
    { key: 'kyc_approved', label: 'Passed verification', count: Number(row.kycApproved) },
    { key: 'has_deal', label: 'Joined a deal', count: Number(row.hasDeal) },
    { key: 'funded_deal', label: 'Funded a deal', count: Number(row.hasFundedDeal) },
    { key: 'money_moved', label: 'Money actually moved', count: Number(row.hasMoneyMoved) },
  ];

  const top = raw[0].count;
  const stages: FunnelStage[] = raw.map((stage, index) => {
    const previous = index === 0 ? null : raw[index - 1].count;
    return {
      ...stage,
      conversionFromPrevious:
        previous === null ? null : previous === 0 ? null : stage.count / previous,
      shareOfTop: top === 0 ? 0 : stage.count / top,
      droppedFromPrevious: previous === null ? 0 : Math.max(0, previous - stage.count),
    };
  });

  // The single most useful sentence a founder can read: where the most people
  // are lost, in absolute terms rather than as a percentage of a small number.
  let biggestDropOff: { from: string; to: string; lost: number } | null = null;
  for (let index = 1; index < stages.length; index += 1) {
    const lost = stages[index].droppedFromPrevious;
    if (lost > 0 && (!biggestDropOff || lost > biggestDropOff.lost)) {
      biggestDropOff = { from: stages[index - 1].label, to: stages[index].label, lost };
    }
  }

  return { stages, biggestDropOff };
}

// ---------------------------------------------------------------------------
// Activity, retention and churn
// ---------------------------------------------------------------------------

export interface ActivitySnapshot {
  /** Signed in at least once in the window. */
  dau: number;
  wau: number;
  mau: number;
  /**
   * DAU as a share of MAU - how many of this month's users show up on a given
   * day. The usual read is that above ~20% is a daily habit; an escrow product
   * is not one, so a low number here is expected rather than alarming.
   */
  stickiness: number | null;
  /** Signed in on more than one distinct day, ever. */
  returningUsers: number;
  /** Signed in exactly once and never came back. */
  oneAndDone: number;
}

export async function activity(): Promise<ActivitySnapshot> {
  const now = Date.now();
  const [row] = await prisma.$queryRaw<
    { dau: bigint; wau: bigint; mau: bigint; returning: bigint; total: bigint }[]
  >`
    SELECT
      COUNT(*) FILTER (WHERE u."lastLoginAt" >= ${new Date(now - DAY_MS)})::bigint AS "dau",
      COUNT(*) FILTER (WHERE u."lastLoginAt" >= ${new Date(now - 7 * DAY_MS)})::bigint AS "wau",
      COUNT(*) FILTER (WHERE u."lastLoginAt" >= ${new Date(now - 30 * DAY_MS)})::bigint AS "mau",
      COUNT(*) FILTER (WHERE (
        SELECT COUNT(DISTINCT DATE(l."createdAt")) FROM login_attempts l
        WHERE l."userId" = u."id" AND l."successful"
      ) > 1)::bigint AS "returning",
      COUNT(*)::bigint AS "total"
    FROM users u
    WHERE u."adminRoleId" IS NULL AND u."role"::text NOT IN ('ADMIN', 'COMPLIANCE', 'MEDIATOR')
  `;

  const dau = Number(row.dau);
  const mau = Number(row.mau);
  const returningUsers = Number(row.returning);

  return {
    dau,
    wau: Number(row.wau),
    mau,
    stickiness: mau === 0 ? null : dau / mau,
    returningUsers,
    oneAndDone: Math.max(0, Number(row.total) - returningUsers),
  };
}

export interface CohortRow {
  /** Week the cohort signed up, as an ISO date. */
  cohort: string;
  size: number;
  /** Still active in week 1, 2, 3, 4 after signup. Null where the week has not elapsed. */
  retention: (number | null)[];
}

/**
 * Weekly signup cohorts and how many came back.
 *
 * Cohorts rather than a single churn number, because one number hides whether a
 * product is improving: a cohort view shows last month's signups behaving
 * differently from this month's, which is the only way to tell whether a change
 * worked.
 */
export async function cohorts(weeks = 8): Promise<{ rows: CohortRow[]; note: string | null }> {
  const rows = await prisma.$queryRaw<
    { cohort: Date; size: bigint; w1: bigint; w2: bigint; w3: bigint; w4: bigint }[]
  >`
    WITH people AS (
      SELECT u."id", DATE_TRUNC('week', u."createdAt") AS cohort, u."createdAt"
      FROM users u
      WHERE u."adminRoleId" IS NULL
        AND u."role"::text NOT IN ('ADMIN', 'COMPLIANCE', 'MEDIATOR')
        AND u."createdAt" >= NOW() - (${weeks} || ' weeks')::interval
    ),
    logins AS (
      SELECT l."userId", l."createdAt" FROM login_attempts l WHERE l."successful"
    )
    SELECT
      p.cohort AS "cohort",
      COUNT(DISTINCT p."id")::bigint AS "size",
      COUNT(DISTINCT p."id") FILTER (WHERE EXISTS (
        SELECT 1 FROM logins g WHERE g."userId" = p."id"
          AND g."createdAt" >= p."createdAt" + interval '7 days'
          AND g."createdAt" <  p."createdAt" + interval '14 days'))::bigint AS "w1",
      COUNT(DISTINCT p."id") FILTER (WHERE EXISTS (
        SELECT 1 FROM logins g WHERE g."userId" = p."id"
          AND g."createdAt" >= p."createdAt" + interval '14 days'
          AND g."createdAt" <  p."createdAt" + interval '21 days'))::bigint AS "w2",
      COUNT(DISTINCT p."id") FILTER (WHERE EXISTS (
        SELECT 1 FROM logins g WHERE g."userId" = p."id"
          AND g."createdAt" >= p."createdAt" + interval '21 days'
          AND g."createdAt" <  p."createdAt" + interval '28 days'))::bigint AS "w3",
      COUNT(DISTINCT p."id") FILTER (WHERE EXISTS (
        SELECT 1 FROM logins g WHERE g."userId" = p."id"
          AND g."createdAt" >= p."createdAt" + interval '28 days'
          AND g."createdAt" <  p."createdAt" + interval '35 days'))::bigint AS "w4"
    FROM people p
    GROUP BY p.cohort
    ORDER BY p.cohort DESC
  `;

  const now = Date.now();
  const mapped: CohortRow[] = rows.map((row) => {
    const cohortStart = row.cohort.getTime();
    const size = Number(row.size);
    const weekElapsed = (week: number) => now >= cohortStart + (week + 1) * 7 * DAY_MS;
    const value = (count: bigint, week: number) =>
      // Null, not zero, where the week has not finished. Reporting 0% retention
      // for a week that has not happened yet makes a healthy product look dead.
      !weekElapsed(week) ? null : size === 0 ? null : Number(count) / size;
    return {
      cohort: row.cohort.toISOString().slice(0, 10),
      size,
      retention: [value(row.w1, 1), value(row.w2, 2), value(row.w3, 3), value(row.w4, 4)],
    };
  });

  const note =
    mapped.length < 4
      ? 'Fewer than four weekly cohorts exist, so retention trends are not yet meaningful.'
      : null;

  return { rows: mapped, note };
}

// ---------------------------------------------------------------------------
// Revenue
// ---------------------------------------------------------------------------

export interface RevenueSnapshot {
  /** Fee income in the last 30 days, in XAF. */
  last30dXaf: number;
  /** The 30 days before that, for direction. */
  previous30dXaf: number;
  growthRate: number | null;
  /** Last 30 days x 12. NOT recurring revenue - see the note. */
  annualisedRunRateXaf: number;
  /** Total fee income ever. */
  allTimeXaf: number;
  /** Gross value released through escrow in the last 30 days. */
  gmv30dXaf: number;
  /** Fee income as a share of GMV - the real take rate. */
  takeRate: number | null;
  note: string;
}

export async function revenue(): Promise<RevenueSnapshot> {
  const [row] = await prisma.$queryRaw<
    { recent: Prisma.Decimal; previous: Prisma.Decimal; allTime: Prisma.Decimal; gmv: Prisma.Decimal }[]
  >`
    SELECT
      COALESCE(SUM(ABS(t."amount")) FILTER (
        WHERE t."type" = 'FEE' AND t."createdAt" >= NOW() - interval '30 days'), 0) AS "recent",
      COALESCE(SUM(ABS(t."amount")) FILTER (
        WHERE t."type" = 'FEE' AND t."createdAt" >= NOW() - interval '60 days'
          AND t."createdAt" < NOW() - interval '30 days'), 0) AS "previous",
      COALESCE(SUM(ABS(t."amount")) FILTER (WHERE t."type" = 'FEE'), 0) AS "allTime",
      COALESCE(SUM(ABS(t."amount")) FILTER (
        WHERE t."type" = 'DEPOSIT' AND t."createdAt" >= NOW() - interval '30 days'), 0) AS "gmv"
    FROM wallet_transactions t
  `;

  const last30dXaf = Number(row.recent);
  const previous30dXaf = Number(row.previous);
  const gmv30dXaf = Number(row.gmv);

  return {
    last30dXaf,
    previous30dXaf,
    growthRate: previous30dXaf === 0 ? null : (last30dXaf - previous30dXaf) / previous30dXaf,
    annualisedRunRateXaf: last30dXaf * 12,
    allTimeXaf: Number(row.allTime),
    gmv30dXaf,
    takeRate: gmv30dXaf === 0 ? null : last30dXaf / gmv30dXaf,
    note:
      'Bizik earns transaction fees, not subscriptions, so this is NOT MRR or ARR. ' +
      'Revenue does not recur by itself - it depends on people transacting again, which is ' +
      'what the retention and funnel figures are for. The run rate is last 30 days x 12 and ' +
      'assumes volume holds.',
  };
}

// ---------------------------------------------------------------------------
// Profitability
// ---------------------------------------------------------------------------

export interface ProfitabilitySnapshot {
  month: string;
  revenueXaf: number;
  costsXaf: number;
  costsByCategory: { category: string; amountXaf: number }[];
  /** Revenue minus operating costs. Null when no costs have been entered. */
  ebitdaXaf: number | null;
  marginPct: number | null;
  gap: MetricGap | null;
}

/**
 * EBITDA for a month.
 *
 * Returns null, loudly, when no costs have been entered for that month. The
 * alternative - treating absent costs as zero - would report revenue as profit
 * and show a company that is losing money as comfortably profitable. That is
 * the single most dangerous number a dashboard can display, so it is not
 * displayed until somebody has said what the month cost.
 */
export async function profitability(month: Date): Promise<ProfitabilitySnapshot> {
  const monthStart = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));

  const [[revenueRow], costRows] = await Promise.all([
    prisma.$queryRaw<{ total: Prisma.Decimal }[]>`
      SELECT COALESCE(SUM(ABS(t."amount")), 0) AS "total"
      FROM wallet_transactions t
      WHERE t."type" = 'FEE' AND t."createdAt" >= ${monthStart} AND t."createdAt" < ${monthEnd}
    `,
    prisma.operatingCost.findMany({ where: { month: monthStart } }),
  ]);

  const revenueXaf = Number(revenueRow.total);
  const costsByCategory = costRows.map((cost) => ({
    category: cost.category,
    amountXaf: Number(cost.amountXaf),
  }));
  const costsXaf = costsByCategory.reduce((sum, cost) => sum + cost.amountXaf, 0);

  const hasCosts = costRows.length > 0;
  return {
    month: monthStart.toISOString().slice(0, 7),
    revenueXaf,
    costsXaf,
    costsByCategory,
    ebitdaXaf: hasCosts ? revenueXaf - costsXaf : null,
    marginPct: hasCosts && revenueXaf > 0 ? (revenueXaf - costsXaf) / revenueXaf : null,
    gap: hasCosts
      ? null
      : {
          metric: 'EBITDA',
          reason: 'No operating costs have been entered for this month.',
          needs:
            'Enter the month\'s infrastructure, salary, provider, marketing and legal costs ' +
            'under Analytics, then EBITDA and margin are computed from them.',
        },
  };
}

export { toXaf };
