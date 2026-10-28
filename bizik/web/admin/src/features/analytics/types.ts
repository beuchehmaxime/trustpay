/** Reports & analytics types - mirrors backend AnalyticsService (SRS MOD-12). */

export interface Kpi {
  value: number;
  delta: number;
  deltaUnit: 'pct' | 'pts';
}

export interface AnalyticsKpis {
  gmv: Kpi;
  revenue: Kpi;
  transactions: Kpi;
  newUsers: Kpi;
  disputeRate: Kpi;
}

export interface TrendPoint {
  label: string;
  value: number;
}

export interface AnalyticsOverview {
  kpis: AnalyticsKpis;
  live: { activeProjects: number; openDisputes: number };
  trends: {
    gmv: TrendPoint[];
    revenue: TrendPoint[];
    users: TrendPoint[];
    transactions: TrendPoint[];
  };
  breakdowns: {
    revenueByType: { type: string; label: string; usd: number }[];
    gmvByCurrency: { currency: string; amount: number; count: number }[];
    projectsByStatus: { status: string; count: number }[];
    usersByTier: { tier: number; count: number }[];
  };
}

export type ReportType =
  | 'DAILY_TRANSACTION_SUMMARY'
  | 'MONTHLY_AML'
  | 'KYC_COVERAGE'
  | 'SUSPICIOUS_ACTIVITY'
  | 'EARNINGS_TAX'
  | 'GMV_ANALYTICS';

export interface GeneratedReport {
  filename: string;
  csv: string;
  report: { id: string; type: ReportType; format: string; status: string; createdAt: string };
}

export interface ReportRow {
  id: string;
  type: ReportType;
  format: string;
  status: string;
  generatedBy: string;
  createdAt: string;
}
