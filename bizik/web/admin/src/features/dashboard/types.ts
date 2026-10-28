/** Admin dashboard types - mirrors backend DashboardService (permission-scoped). */

export interface DashboardKpis {
  gmv?: { value: number; delta: number };
  fundsInEscrow?: { value: number; milestones: number };
  activeProjects?: { value: number; thisWeek: number };
  pendingPayouts?: { value: number; queuedUsd: number };
  newUsers?: { value: number; delta: number };
}

export interface DashboardQueues {
  kyc?: number;
  disputes?: number;
  aml?: number;
  payouts?: number;
}

export interface TrendPoint {
  label: string;
  value: number;
}

export interface DashboardCharts {
  gmvTrend?: TrendPoint[];
  signups?: TrendPoint[];
}

export interface ActivityRow {
  id: string;
  actorName: string;
  action: string;
  target: string;
  result: string;
  createdAt: string;
}

export interface DashboardOverview {
  kpis: DashboardKpis;
  queues: DashboardQueues;
  charts: DashboardCharts;
  recentActivity: ActivityRow[];
}
