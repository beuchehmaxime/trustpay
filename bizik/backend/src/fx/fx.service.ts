import { fxQuote } from '../lib/fx';
import { FxRateInput } from './fx.validation';

export const FxService = {
  /** Quote for converting `amount` of `from` into `to` (FR-PAY-009). */
  rate(input: FxRateInput) {
    const quote = fxQuote(input.from, input.to, input.amount ?? 1);
    return {
      from: quote.from,
      to: quote.to,
      fromAmount: quote.fromAmount,
      toAmount: quote.toAmount,
      midMarketRate: quote.midMarketRate,
      /** Margin as a percentage (e.g. 0.5). */
      marginPct: quote.marginPct * 100,
      appliedRate: quote.appliedRate,
      /** Rates come from the admin-configured Exchange Rates (single source of truth). */
      source: 'configured' as const,
      /** No live feed drives conversions; the admin rate is authoritative. */
      asOf: null,
      /** Quote validity (SRS FR-PAY-009: shown with timestamp + expiry). */
      expiresInSeconds: 30,
    };
  },
};
