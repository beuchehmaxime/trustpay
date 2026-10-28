import { Currency } from '@prisma/client';

import { AppError } from '../lib/errors';
import { recordAudit } from '../lib/audit';
import { CURRENCY_META } from '../lib/domain';
import { loadSettings } from '../lib/settings';
import { FeesAdminRepository } from './feesadmin.repository';

export interface FeeUpdateInput {
  clientServicePct: number;
  freelancerFeePct: number;
  expressWithdrawalPct: number;
  fxMarginPct: number;
  minWithdrawalUsd: number;
}

async function settingsDto() {
  const setting = await FeesAdminRepository.getSettings();
  return {
    clientServicePct: Number(setting?.clientServicePct ?? 0),
    freelancerFeePct: Number(setting?.freelancerFeePct ?? 0),
    expressWithdrawalPct: Number(setting?.expressWithdrawalPct ?? 0),
    fxMarginPct: Number(setting?.fxMarginPct ?? 0),
    minWithdrawalUsd: Number(setting?.minWithdrawalUsd ?? 0),
    updatedAt: setting?.updatedAt ?? null,
    updatedById: setting?.updatedById ?? null,
  };
}

async function fxRatesDto() {
  const rates = await FeesAdminRepository.getFxRates();
  const byCurrency = new Map(rates.map((rate) => [rate.currency, rate]));
  return (Object.keys(CURRENCY_META) as Currency[]).map((currency) => {
    const rate = byCurrency.get(currency);
    const usdRate = Number(rate?.usdRate ?? CURRENCY_META[currency].usd);
    return {
      currency,
      label: CURRENCY_META[currency].label,
      flag: CURRENCY_META[currency].flag,
      usdRate,
      // How many of this currency equal 1 USD (handy display).
      perUsd: usdRate > 0 ? Math.round((1 / usdRate) * 10000) / 10000 : 0,
      updatedAt: rate?.updatedAt ?? null,
    };
  });
}

export const FeesAdminService = {
  /** Current fee/FX config + fee revenue (fees.view). */
  async config() {
    const [fees, fxRates, revenueRows] = await Promise.all([
      settingsDto(),
      fxRatesDto(),
      FeesAdminRepository.feeRevenueByType(),
    ]);
    const feeRevenue = revenueRows.map((row) => ({
      type: row.type,
      currency: row.currency,
      amount: Number(row._sum.amount ?? 0),
      count: row._count._all,
    }));
    return { fees, fxRates, feeRevenue };
  },

  /** Update the fee schedule (fees.manage). Percentages are fractions (0.035 = 3.5%). */
  async updateFees(adminId: string, input: FeeUpdateInput) {
    const before = await settingsDto();
    const bounded = (value: number, max: number) => value >= 0 && value <= max;
    if (
      !bounded(input.clientServicePct, 0.5) ||
      !bounded(input.freelancerFeePct, 0.5) ||
      !bounded(input.expressWithdrawalPct, 0.5) ||
      !bounded(input.fxMarginPct, 0.2)
    ) {
      throw new AppError(400, 'Q-400', 'Fee percentages are out of the allowed range.');
    }
    if (input.minWithdrawalUsd < 0 || input.minWithdrawalUsd > 100000) {
      throw new AppError(400, 'Q-400', 'Minimum withdrawal is out of range.');
    }

    await FeesAdminRepository.updateSettings({
      clientServicePct: input.clientServicePct,
      freelancerFeePct: input.freelancerFeePct,
      expressWithdrawalPct: input.expressWithdrawalPct,
      fxMarginPct: input.fxMarginPct,
      minWithdrawalUsd: input.minWithdrawalUsd,
      updatedById: adminId,
    });
    await loadSettings();
    void recordAudit({
      actorId: adminId,
      action: 'fees.update',
      entityType: 'PlatformSetting',
      entityId: 'global',
      before,
      after: input,
    });
    return this.config();
  },

  /** Update a currency's indicative USD rate (fees.manage). */
  async updateFxRate(adminId: string, currency: Currency, usdRate: number) {
    if (!(currency in CURRENCY_META)) {
      throw new AppError(400, 'Q-400', 'Unknown currency.');
    }
    if (!(usdRate > 0) || usdRate > 1_000_000) {
      throw new AppError(400, 'Q-400', 'Rate must be a positive number.');
    }
    const before = await FeesAdminRepository.getFxRates();
    const previous = Number(before.find((rate) => rate.currency === currency)?.usdRate ?? 0);
    await FeesAdminRepository.upsertFxRate(currency, usdRate, adminId);
    await loadSettings();
    void recordAudit({
      actorId: adminId,
      action: 'fx.rate_update',
      entityType: 'FxRate',
      entityId: currency,
      before: { usdRate: previous },
      after: { usdRate },
    });
    return this.config();
  },
};
