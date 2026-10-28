import { config } from '../../config/env';
import { PaymentService } from './payment.service';
import { PaymentRepository } from '../persistence/payment.repository';

/** Only poll transactions that have been PROCESSING for at least this long. */
const STALE_AFTER_MS = 60 * 1000;

/**
 * Safety net for the asynchronous providers: webhooks can be missed or delayed,
 * so we periodically ask each provider for the real status of every PROCESSING
 * transaction and settle it. Idempotent via PaymentService, so it never conflicts
 * with a webhook that arrives at the same time.
 */
export const PaymentReconciliationService = {
  async runOnce(): Promise<{ checked: number; settled: number }> {
    const stale = await PaymentRepository.findStale(STALE_AFTER_MS, 50);
    let settled = 0;

    for (const paymentTransaction of stale) {
      try {
        const updated = await PaymentService.pollAndSettle(paymentTransaction);
        if (updated.status !== 'PROCESSING') settled += 1;
      } catch (error) {
        console.error(
          `[reconciliation] ${paymentTransaction.transactionReference} failed:`,
          (error as Error).message,
        );
      }
    }

    await this.expireStaleHolds();
    return { checked: stale.length, settled };
  },

  /** Auto-reject (and refund) held withdrawals no operator actioned within the SLA. */
  async expireStaleHolds(): Promise<number> {
    const slaHours = config.payments.withdrawalApprovalSlaHours;
    if (slaHours <= 0) return 0;
    const cutoff = new Date(Date.now() - slaHours * 60 * 60 * 1000);
    const expired = await PaymentRepository.findExpiredHolds(cutoff, 50);
    let rejected = 0;
    for (const hold of expired) {
      try {
        await PaymentService.rejectWithdrawal('system', hold.id, 'Auto-expired - not reviewed within SLA');
        rejected += 1;
        console.log(`[reconciliation] held withdrawal ${hold.transactionReference} auto-expired (>${slaHours}h) and refunded`);
      } catch (error) {
        console.error(`[reconciliation] failed to expire hold ${hold.transactionReference}:`, (error as Error).message);
      }
    }
    return rejected;
  },
};
