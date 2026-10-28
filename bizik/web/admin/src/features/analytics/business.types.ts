/** Business analytics - see backend src/analytics/business-analytics.service.ts. */

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  /** Share of the people who reached the previous stage. Null for the first. */
  conversionFromPrevious: number | null;
  shareOfTop: number;
  droppedFromPrevious: number;
}

export interface ActivitySnapshot {
  dau: number;
  wau: number;
  mau: number;
  stickiness: number | null;
  returningUsers: number;
  oneAndDone: number;
}

export interface CohortRow {
  cohort: string;
  size: number;
  /** Weeks 1-4 after signup. Null where the week has not elapsed yet. */
  retention: (number | null)[];
}

export interface VisitTotals {
  today: number;
  last7Days: number;
  last30Days: number;
  allTime: number;
  pageViewsLast30Days: number;
  returningVisitors: number;
}

export interface PageStat {
  path: string;
  views: number;
  visitors: number;
  medianSeconds: number | null;
  exitRate: number | null;
}

export interface ProductAnalytics {
  funnel: {
    stages: FunnelStage[];
    biggestDropOff: { from: string; to: string; lost: number } | null;
  };
  activity: ActivitySnapshot;
  cohorts: { rows: CohortRow[]; note: string | null };
  visits: VisitTotals;
  pages: PageStat[];
  sources: { source: string; visitors: number }[];
  daily: { date: string; visitors: number; pageViews: number }[];
  conversion: { visitors: number; signedUp: number; rate: number | null };
}

export interface MetricGap {
  metric: string;
  reason: string;
  needs: string;
}

export interface FinancialAnalytics {
  revenue: {
    last30dXaf: number;
    previous30dXaf: number;
    growthRate: number | null;
    annualisedRunRateXaf: number;
    allTimeXaf: number;
    gmv30dXaf: number;
    takeRate: number | null;
    note: string;
  };
  profitability: {
    month: string;
    revenueXaf: number;
    costsXaf: number;
    costsByCategory: { category: string; amountXaf: number }[];
    ebitdaXaf: number | null;
    marginPct: number | null;
    gap: MetricGap | null;
  };
  trend: { month: string; revenueXaf: number; costsXaf: number; ebitdaXaf: number | null }[];
}

export const COST_CATEGORIES = [
  'INFRASTRUCTURE',
  'SALARIES',
  'PAYMENT_PROVIDER',
  'MARKETING',
  'LEGAL_COMPLIANCE',
  'OTHER',
] as const;

export type CostCategory = (typeof COST_CATEGORIES)[number];

export interface OperatingCost {
  id: string;
  month: string;
  category: CostCategory;
  amountXaf: number;
  note: string | null;
}
