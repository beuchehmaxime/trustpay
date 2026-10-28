import { Currency } from '@prisma/client';

import { config } from '../config/env';
import { CURRENCY_META } from './domain';
import { prisma } from './prisma';

/**
 * Editable platform pricing (fees, margins, FX rates) with an in-memory cache.
 *
 * The fee/FX math functions (lib/fees, lib/fx) are synchronous and run on the
 * hot path, so they read from this cache rather than the DB. The cache is
 * seeded from `config` defaults at module load (so it is always valid, even
 * before `loadSettings()` runs), hydrated from the DB on boot, and refreshed
 * whenever an operator edits pricing. Single-process deployment keeps it
 * consistent.
 */
export interface FeeSettings {
  clientServicePct: number;
  freelancerFeePct: number;
  expressWithdrawalPct: number;
  fxMarginPct: number;
  minWithdrawalUsd: number;
}

const ALL_CURRENCIES = Object.keys(CURRENCY_META) as Currency[];

let feeCache: FeeSettings = {
  clientServicePct: config.fees.clientServicePct,
  freelancerFeePct: config.fees.freelancerFeePct,
  expressWithdrawalPct: config.fees.expressWithdrawalPct,
  fxMarginPct: config.fees.fxMarginPct,
  minWithdrawalUsd: config.escrow.minWithdrawalUsd,
};

let fxCache: Record<Currency, number> = ALL_CURRENCIES.reduce(
  (map, currency) => ({ ...map, [currency]: CURRENCY_META[currency].usd }),
  {} as Record<Currency, number>,
);

/** Current fee/margin settings (never throws - falls back to config defaults). */
export function feeSettings(): FeeSettings {
  return feeCache;
}

/**
 * USD value of 1 unit of the given currency. The admin-configured `FxRate` rows
 * (edited under Fees & FX → Exchange Rates) are the single source of truth for
 * every conversion in the app; the `CURRENCY_META` seed is only a last-resort
 * fallback for a currency that somehow has no configured row.
 */
export function usdRateOf(currency: Currency): number {
  return fxCache[currency] ?? CURRENCY_META[currency].usd;
}

/** All USD-per-unit rates, straight from the admin-configured cache. */
export function allUsdRates(): Record<Currency, number> {
  return { ...fxCache };
}

/**
 * Hydrate the cache from the DB, seeding the singleton settings row and the
 * per-currency FX rates from `config`/`CURRENCY_META` defaults on first run.
 */
export async function loadSettings(): Promise<void> {
  // Read first, create only when missing. This was an upsert, and Postgres
  // checks an upsert's INSERT values even when the row already exists: one bad
  // default (FEE_FREELANCER_PCT=10 read as 1000%) overflowed the column, the
  // whole load threw on every boot, and the admin-configured fees and exchange
  // rates were never loaded at all - production ran on raw env values.
  const setting =
    (await prisma.platformSetting.findUnique({ where: { id: 'global' } })) ??
    (await prisma.platformSetting.create({
      data: {
        id: 'global',
        clientServicePct: config.fees.clientServicePct,
        freelancerFeePct: config.fees.freelancerFeePct,
        expressWithdrawalPct: config.fees.expressWithdrawalPct,
        fxMarginPct: config.fees.fxMarginPct,
        minWithdrawalUsd: config.escrow.minWithdrawalUsd,
      },
    }));
  feeCache = {
    clientServicePct: Number(setting.clientServicePct),
    freelancerFeePct: Number(setting.freelancerFeePct),
    expressWithdrawalPct: Number(setting.expressWithdrawalPct),
    fxMarginPct: Number(setting.fxMarginPct),
    minWithdrawalUsd: Number(setting.minWithdrawalUsd),
  };

  const existing = await prisma.fxRate.findMany();
  if (existing.length === 0) {
    await prisma.fxRate.createMany({
      data: ALL_CURRENCIES.map((currency) => ({
        currency,
        usdRate: CURRENCY_META[currency].usd,
      })),
    });
  }
  const rates = await prisma.fxRate.findMany();
  const next = { ...fxCache };
  for (const rate of rates) next[rate.currency] = Number(rate.usdRate);
  fxCache = next;
}
