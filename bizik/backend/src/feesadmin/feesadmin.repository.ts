import { Currency, Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';

/** Reads/writes for the admin Fees & FX console (SRS MOD-09/pricing). */
export const FeesAdminRepository = {
  getSettings() {
    return prisma.platformSetting.findUnique({ where: { id: 'global' } });
  },

  updateSettings(data: Prisma.PlatformSettingUncheckedUpdateInput) {
    return prisma.platformSetting.update({ where: { id: 'global' }, data });
  },

  getFxRates() {
    return prisma.fxRate.findMany();
  },

  upsertFxRate(currency: Currency, usdRate: number, updatedById: string) {
    return prisma.fxRate.upsert({
      where: { currency },
      create: { currency, usdRate, updatedById },
      update: { usdRate, updatedById },
    });
  },

  /** Platform fee revenue grouped by fee type (for the console KPI). */
  feeRevenueByType() {
    return prisma.feeRecord.groupBy({
      by: ['type', 'currency'],
      _sum: { amount: true },
      _count: { _all: true },
    });
  },
};
