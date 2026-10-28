import { emitAdminEvent } from '../../lib/admin-events';
import { redis } from '../../lib/redis';
import { payoutSettings } from '../../lib/system-settings';
import { PaymentProviderFactory } from './payment-provider.factory';

/**
 * Watch the balance withdrawals are actually paid from.
 *
 * Fapshi splits an account into a COLLECTION service and a PAYOUT service with
 * separate balances, and - confirmed against their API reference - offers no
 * endpoint to move money between them. A service that is enabled for payouts
 * "can no longer collect payments", so the two can never be the same service
 * and the collection side cannot pay anybody.
 *
 * The consequence is a float that only ever drains: deposits pile up on the
 * collection side while every withdrawal eats into a payout balance somebody
 * has to top up by hand in the dashboard. Nothing in the product notices it
 * running out, and the first symptom is a user whose withdrawal will not go.
 *
 * So this checks ahead of them. It cannot move the money - no API does - but it
 * can make sure the shortfall is known before it reaches anyone's screen.
 */

/** How many future withdrawals the float should comfortably cover. */
export interface FloatStatus {
  balance: number;
  currency: string;
  threshold: number;
  healthy: boolean;
  /** Null when the provider could not be reached - not the same as zero. */
  reachable: boolean;
}

export async function checkPayoutFloat(): Promise<FloatStatus | null> {
  if (!PaymentProviderFactory.canDisburse('MTN_MOBILE_MONEY')) return null;

  // Read through payoutSettings(), NOT systemSettings().providers.payouts.
  // The stored settings row predates this field, so the raw object has no
  // `floatWarningXaf` at all - and `undefined <= 0` is false, so the guard
  // below let it through and every alert read "below the undefined XAF warning
  // level". payoutSettings() is the accessor that fills the default in.
  const threshold = payoutSettings().floatWarningXaf;
  if (!Number.isFinite(threshold) || threshold <= 0) return null; // monitoring off

  let balance: number;
  let currency: string;
  try {
    const result = await PaymentProviderFactory.payoutBalance();
    balance = result.balance;
    currency = result.currency;
  } catch (error) {
    // Unreachable is NOT empty. Alerting on it would train operators to ignore
    // the alert that matters, so it is logged and left alone.
    console.warn(`[payments] could not read the payout float - ${(error as Error).message}`);
    return { balance: 0, currency: 'XAF', threshold, healthy: true, reachable: false };
  }

  const healthy = balance >= threshold;

  // Alert on the TRANSITION, not on every check.
  //
  // The first version of this raised a fresh notification every hour for the
  // same unchanged, already-acknowledged condition - six identical "Payout
  // float is empty" entries in one afternoon. An operator who marks one read
  // and finds another an hour later does not learn that the float is low, they
  // learn that this alert is noise. Which is the exact failure the comment two
  // functions down warns about, committed here.
  //
  // So: once when it goes bad, once a day while it stays bad so it cannot be
  // forgotten entirely, and once when it recovers.
  const alerted = await wasAlreadyAlerted(healthy);

  if (healthy) {
    return { balance, currency, threshold, healthy, reachable: true };
  }

  if (!alerted) {
    console.warn(
      `[payments] payout float LOW: ${balance} ${currency} (warn below ${threshold}).` +
        ' Transfer from the collection service in the provider dashboard.',
    );
    void emitAdminEvent({
      type: 'SYSTEM',
      severity: balance <= 0 ? 'CRITICAL' : 'WARNING',
      title: balance <= 0 ? 'Payout float is empty' : 'Payout float is running low',
      body:
        `The disbursement service holds ${balance} ${currency}, below the ${threshold} ${currency} warning level.` +
        ' Withdrawals are paid from this balance, and deposits do NOT move across to it on their own -' +
        ' the provider has no API for that transfer. Move funds from the collection service in their' +
        ' dashboard. Until then withdrawals are queued for manual payout rather than refused.',
      permission: 'payouts.manage',
      link: '/wallets',
    });
  }

  return { balance, currency, threshold, healthy, reachable: true };
}

const ALERT_KEY = 'payments:payout-float:alerted';
/** How long an unresolved shortage stays quiet before it is raised again. */
const REPEAT_AFTER_SECONDS = 24 * 60 * 60;

/**
 * Has this condition already been reported recently?
 *
 * Returns true when an alert for the current shortage is still "live", so the
 * caller stays silent. Recovery clears the marker, so the next shortage alerts
 * immediately rather than waiting out the previous one's window.
 *
 * Redis rather than a column because this is operational noise control, not a
 * fact about the business - losing it on a flush costs one duplicate alert.
 */
async function wasAlreadyAlerted(healthy: boolean): Promise<boolean> {
  try {
    if (healthy) {
      await redis.del(ALERT_KEY);
      return false;
    }
    const existing = await redis.get(ALERT_KEY);
    if (existing) return true;
    await redis.set(ALERT_KEY, new Date().toISOString(), { EX: REPEAT_AFTER_SECONDS });
    return false;
  } catch {
    // Redis unavailable: alert rather than stay silent. A duplicate is an
    // annoyance; a missed empty float stops people withdrawing.
    return false;
  }
}
