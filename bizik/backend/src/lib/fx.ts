import { Currency } from '@prisma/client';

import { round2 } from './fees';
import { feeSettings, usdRateOf } from './settings';

/**
 * FX quote (SRS FR-PAY-009). Mid-market rate comes from the indicative USD
 * rate per currency; BiZik applies a 0.5% margin below mid-market on the
 * received side. In production swap `CURRENCY_META[*].usd` for a live feed
 * (Open Exchange Rates) - the rest of the maths stays the same.
 *
 * `appliedRate` is units of `to` per 1 unit of `from` after the margin.
 */
export interface FxQuote {
  from: Currency;
  to: Currency;
  fromAmount: number;
  toAmount: number;
  midMarketRate: number;
  marginPct: number;
  appliedRate: number;
}

export function fxQuote(from: Currency, to: Currency, amount = 1): FxQuote {
  const midMarketRate = usdRateOf(from) / usdRateOf(to);
  const margin = feeSettings().fxMarginPct;
  const appliedRate = midMarketRate * (1 - margin);
  return {
    from,
    to,
    fromAmount: round2(amount),
    toAmount: round2(amount * appliedRate),
    midMarketRate,
    marginPct: margin,
    appliedRate,
  };
}
