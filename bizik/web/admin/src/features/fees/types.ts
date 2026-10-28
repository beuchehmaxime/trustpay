/** Fees & FX types - mirrors backend FeesAdminService. */

export interface FeeSchedule {
  clientServicePct: number;
  freelancerFeePct: number;
  expressWithdrawalPct: number;
  fxMarginPct: number;
  minWithdrawalUsd: number;
  updatedAt: string | null;
  updatedById: string | null;
}

export interface FxRate {
  currency: string;
  label: string;
  flag: string;
  usdRate: number;
  perUsd: number;
  updatedAt: string | null;
}

export interface FeeRevenue {
  type: string;
  currency: string;
  amount: number;
  count: number;
}

export interface FeesConfig {
  fees: FeeSchedule;
  fxRates: FxRate[];
  feeRevenue: FeeRevenue[];
}

export interface FeeUpdateInput {
  clientServicePct: number;
  freelancerFeePct: number;
  expressWithdrawalPct: number;
  fxMarginPct: number;
  minWithdrawalUsd: number;
}
