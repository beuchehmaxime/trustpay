import { Currency } from '@prisma/client';

import { config } from '../config/env';
import { CURRENCY_META } from './domain';

/**
 * Optional live FX reference feed (SRS FR-PAY-009). Pulls real mid-market rates
 * from a free, key-less provider (exchangerate-api.com's open endpoint) into an
 * in-memory cache.
 *
 * IMPORTANT: this feed is NOT authoritative. The admin-configured `FxRate` rows
 * (Fees & FX → Exchange Rates) are the single source of truth for every
 * conversion - see `usdRateOf` in lib/settings. The feed is disabled by default
 * (FX_FEED_ENABLED) and, even when on, only serves as an operator reference; it
 * never overrides the admin rates.
 *
 * The provider returns rates as "units of X per 1 USD"; we store the inverse -
 * the USD value of 1 unit of X - to match the convention used everywhere else
 * in the pricing math.
 */

const SUPPORTED_CURRENCIES = Object.keys(CURRENCY_META) as Currency[];

interface FeedResponse {
  result?: string;
  rates?: Record<string, number>;
  time_last_update_unix?: number;
}

let liveUsdValues: Partial<Record<Currency, number>> = {};
let lastUpdatedAt: Date | null = null;
let refreshTimer: NodeJS.Timeout | null = null;

/** USD value of 1 unit of `currency` from the live feed, or undefined if unknown. */
export function getLiveUsdRate(currency: Currency): number | undefined {
  return liveUsdValues[currency];
}

/** All live USD values currently cached (currencies missing from the feed are absent). */
export function liveUsdRates(): Partial<Record<Currency, number>> {
  return { ...liveUsdValues };
}

/** Whether the convert/quote path is currently backed by a live feed value. */
export function isLiveFxAvailable(): boolean {
  return lastUpdatedAt !== null;
}

/** When the live rates were last refreshed (null until the first successful fetch). */
export function liveFxUpdatedAt(): Date | null {
  return lastUpdatedAt;
}

/**
 * Fetch the latest rates and update the cache. Best-effort: on any failure the
 * previous cache (or the configured fallback) stays in place and we log why.
 */
/**
 * Append one row per currency for this refresh. Best-effort: a failure to write
 * history must never stop the platform using the rates it just fetched.
 */
async function persistSnapshot(values: Partial<Record<Currency, number>>): Promise<void> {
  const rows = (Object.entries(values) as [Currency, number][]).map(([currency, usdValue]) => ({
    baseCurrency: 'USD' as Currency,
    quoteCurrency: currency,
    // Stored the same way the pricing math reads it: USD value of 1 unit.
    rate: usdValue,
    provider: 'open_er_api',
  }));
  if (!rows.length) return;
  const { prisma } = await import('./prisma');
  await prisma.fxRateLog.createMany({ data: rows });
}

export async function refreshLiveFxRates(): Promise<void> {
  if (!config.fx.feedEnabled) return;
  try {
    const response = await fetch(config.fx.feedUrl, {
      signal: AbortSignal.timeout(config.fx.feedTimeoutMs),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = (await response.json()) as FeedResponse;
    if (payload.result && payload.result !== 'success') {
      throw new Error(`provider result=${payload.result}`);
    }
    const rates = payload.rates;
    if (!rates || typeof rates.USD !== 'number' || rates.USD <= 0) {
      throw new Error('missing USD base in feed response');
    }

    // The feed is USD-based (units per 1 USD); normalise against its own USD
    // entry in case the base ever differs, then invert to USD-value-per-unit.
    const usdPerBase = rates.USD;
    const nextValues: Partial<Record<Currency, number>> = {};
    for (const currency of SUPPORTED_CURRENCIES) {
      const unitsPerUsd = rates[currency];
      if (typeof unitsPerUsd === 'number' && unitsPerUsd > 0) {
        nextValues[currency] = usdPerBase / unitsPerUsd;
      }
    }

    if (Object.keys(nextValues).length === 0) {
      throw new Error('no supported currencies in feed response');
    }

    liveUsdValues = nextValues;
    lastUpdatedAt = new Date();
    // Keep a trail. fx_rates_log has existed since the first schema and nothing
    // ever wrote to it, which is why rate history had no data to show. Recording
    // here means history accrues from now on, honestly starting empty.
    void persistSnapshot(nextValues).catch((error) =>
      console.error('[fx] could not record rate history -', (error as Error).message),
    );
    console.log(
      `[fx] live rates refreshed - ${Object.keys(nextValues).length} currencies` +
        ` (1 USD ≈ ${rates.NGN ?? '?'} NGN, ${rates.XAF ?? '?'} XAF)`,
    );
  } catch (error) {
    console.error(
      `[fx] live refresh failed, using ${isLiveFxAvailable() ? 'last cached' : 'configured'} rates -`,
      (error as Error).message,
    );
  }
}

/**
 * Start the recurring refresh. Fetches once immediately, then on an interval.
 * The timer is unref'd so it never keeps the process alive on its own.
 */
export function startLiveFxFeed(): void {
  if (!config.fx.feedEnabled) {
    console.log('[fx] live feed disabled - using configured FX rates');
    return;
  }
  if (refreshTimer) return;
  void refreshLiveFxRates();
  refreshTimer = setInterval(() => {
    void refreshLiveFxRates();
  }, config.fx.feedRefreshMs);
  refreshTimer.unref();
}
