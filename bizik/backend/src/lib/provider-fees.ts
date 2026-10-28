import { systemSettings } from './system-settings';
import type { Currency, PaymentProviderName } from '@prisma/client';

/**
 * What the payment rail charges us, and who pays it.
 *
 * Fapshi and the mobile-money operator take a cut of every movement. Until now
 * the platform absorbed it silently: a 250 XAF deposit credited 250 to the
 * wallet while only 242 reached our Fapshi balance, so every top-up was a 3.2%
 * loss that appeared nowhere in the books. The gap only surfaced because the
 * Fapshi dashboard and the wallet disagreed.
 *
 * The rule now is that the user's wallet number is the number they asked for,
 * and the rail's cut is charged ON TOP:
 *
 *   deposit     ask for 250 -> charged 258 at the prompt -> wallet +250
 *   withdrawal  ask for 100 -> wallet -103             -> they receive 100
 *
 * ESTIMATED, not measured, and that is the hard part. Fapshi reports its fee
 * only AFTER a transaction settles (`amount` vs `revenue` on the status
 * response), but we have to charge before it starts. So this estimates from a
 * configured rate, and `providerFeeActual` records what was really taken, so
 * the two can be compared and the rate corrected rather than silently drifting.
 *
 * The rate lives in settings rather than here because it is a commercial term
 * somebody else sets and changes, and a rate that needs a deploy to change is a
 * rate that stays wrong.
 */

export type FeeDirection = 'deposit' | 'withdrawal';

export interface ProviderFeeQuote {
  /** What the user asked for - the amount that reaches their wallet or phone. */
  amount: number;
  /** The rail's estimated cut, charged on top. */
  fee: number;
  /** What is actually collected (deposit) or debited (withdrawal). */
  total: number;
  /** The rate used, so a quote can explain itself. */
  rate: number;
}

/**
 * Round a fee UP to a whole franc.
 *
 * XAF has no subunit - there is no such thing as half a franc, and Fapshi
 * rejects a fractional amount outright. Rounding UP rather than to nearest
 * means a rounding difference is always in the platform's favour by at most one
 * franc, which is the right direction: the alternative is being a franc short
 * on every transaction and discovering it as a slow leak.
 *
 * The single observed data point fits this: 250 x 3% = 7.5, and Fapshi took 8.
 */
function roundFeeUp(value: number): number {
  return Math.ceil(value - 1e-9);
}

/**
 * The rail's cut on a movement, in the same currency.
 *
 * A fee is never less than the configured minimum, because percentage rails
 * almost always carry a floor and a 1% cut of 100 XAF would not cover it.
 */
export function quoteProviderFee(
  amount: number,
  direction: FeeDirection,
  _provider?: PaymentProviderName,
  currency: Currency = 'XAF',
): ProviderFeeQuote {
  const settings = systemSettings().providers.providerFees;
  const applies = direction === 'deposit' ? settings.chargeOnDeposit : settings.chargeOnWithdrawal;

  // Fees are configured for the XAF rails. A currency we have no figure for
  // gets no fee rather than a guessed one: inventing a charge is worse than
  // absorbing a cost we actually understand.
  if (!applies || currency !== 'XAF') {
    return { amount, fee: 0, total: amount, rate: 0 };
  }

  const rate = direction === 'deposit' ? settings.depositRate : settings.withdrawalRate;
  const minimum = direction === 'deposit' ? settings.depositMinimumXaf : settings.withdrawalMinimumXaf;
  const fee = Math.max(minimum, roundFeeUp(amount * rate));

  return { amount, fee, total: amount + fee, rate };
}

/**
 * How far an estimate was from what the rail actually took.
 *
 * Returned rather than acted on: a single franc of rounding is noise, a
 * consistent gap means the configured rate is wrong, and only the caller has
 * the context to decide which it is looking at.
 */
export function feeVariance(estimated: number, actual: number): number {
  return Number((actual - estimated).toFixed(4));
}
