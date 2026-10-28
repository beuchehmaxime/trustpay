import { Queue, Worker } from 'bullmq';

import { config } from '../config/env';
import { bullConnection } from './queue';

/**
 * Recurring background schedules (BullMQ repeatable jobs). The schedule lives in
 * Redis, so it survives restarts and fires once per interval regardless of how
 * many API instances are running. Drives the weekly user digest and the daily
 * delivery-date reminders.
 */
const SCHEDULER_QUEUE = 'scheduler';
const WEEKLY_DIGEST_JOB = 'weekly-digest';
const DELIVERY_REMINDER_JOB = 'delivery-reminder';
const PAYMENT_RECONCILE_JOB = 'payment-reconciliation';
const PAYOUT_FLOAT_JOB = 'payout-float-check';
const DORMANCY_JOB = 'dormant-account-review';
const WHATSAPP_LOG_PURGE_JOB = 'whatsapp-log-purge';
const AML_MONITOR_JOB = 'aml-transaction-monitor';
const RETENTION_JOB = 'data-retention';
const LEDGER_RECONCILE_JOB = 'ledger-reconciliation';
const CAMPAIGN_SEND_JOB = 'whatsapp-campaign-send';

/**
 * Schedule one batch of a WhatsApp campaign.
 *
 * Exported so campaign delivery runs on the same queue as everything else
 * rather than as a loop inside the web process: it survives a deploy, the pace
 * is enforced by the delay rather than by a sleeping request handler, and a
 * cancelled campaign stops within one batch.
 *
 * `jobId` is per campaign, so a double-enqueue - two operators, a retry, a
 * resume racing a live run - collapses into one job instead of sending the
 * audience twice at double the rate.
 */
export async function enqueueCampaignBatch(campaignId: string, delayMs = 0): Promise<void> {
  const queue = schedulerQueue ?? new Queue(SCHEDULER_QUEUE, { connection: bullConnection });
  schedulerQueue = queue;
  await queue.add(
    CAMPAIGN_SEND_JOB,
    { campaignId },
    {
      jobId: `${CAMPAIGN_SEND_JOB}:${campaignId}:${Date.now()}`,
      delay: delayMs,
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}

let schedulerQueue: Queue | null = null;
let schedulerWorker: Worker | null = null;

/** Register (idempotently) the recurring background jobs. */
export async function registerSchedules(): Promise<void> {
  schedulerQueue = schedulerQueue ?? new Queue(SCHEDULER_QUEUE, { connection: bullConnection });

  if (config.digest.enabled) {
    await schedulerQueue.add(
      WEEKLY_DIGEST_JOB,
      {},
      {
        repeat: { pattern: config.digest.cron },
        jobId: WEEKLY_DIGEST_JOB, // stable id keeps the repeatable schedule single
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
    console.log(`[scheduler] weekly digest scheduled (${config.digest.cron})`);
  } else {
    console.log('[scheduler] weekly digest disabled (DIGEST_ENABLED=false)');
  }

  if (config.reminder.enabled) {
    await schedulerQueue.add(
      DELIVERY_REMINDER_JOB,
      {},
      {
        repeat: { pattern: config.reminder.cron },
        jobId: DELIVERY_REMINDER_JOB,
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
    console.log(`[scheduler] delivery reminders scheduled (${config.reminder.cron})`);
  } else {
    console.log('[scheduler] delivery reminders disabled (REMINDER_ENABLED=false)');
  }

  if (config.payments.reconciliation.enabled) {
    await schedulerQueue.add(
      PAYMENT_RECONCILE_JOB,
      {},
      {
        repeat: { pattern: config.payments.reconciliation.cron },
        jobId: PAYMENT_RECONCILE_JOB,
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
    console.log(`[scheduler] payment reconciliation scheduled (${config.payments.reconciliation.cron})`);
  } else {
    console.log('[scheduler] payment reconciliation disabled (PAYMENT_RECONCILE_ENABLED=false)');
  }

  // The balance withdrawals are paid from only ever drains: the provider has no
  // API to move money from the collection service, so somebody must top it up
  // by hand. Hourly is often enough to catch it before a user does, and rare
  // enough that an unreachable provider does not become a stream of noise.
  await schedulerQueue.add(
    PAYOUT_FLOAT_JOB,
    {},
    {
      repeat: { pattern: '0 * * * *' },
      jobId: PAYOUT_FLOAT_JOB,
      removeOnComplete: true,
      removeOnFail: 50,
    },
  );
  console.log('[scheduler] payout float check scheduled (hourly)');

  // Dormant accounts: warn whoever is due today, then tell operators if any
  // account has finished its notice period. Daily and early, so a warning that
  // fails has the rest of the day's runs to succeed before the date passes -
  // and because nothing here deletes anything, a missed run costs a delay, not
  // an account.
  await schedulerQueue.add(
    DORMANCY_JOB,
    {},
    {
      repeat: { pattern: '30 5 * * *' },
      jobId: DORMANCY_JOB,
      removeOnComplete: true,
      removeOnFail: 50,
    },
  );
  console.log('[scheduler] dormant-account review scheduled (daily 05:30)');

  // Chat-log retention. Runs nightly whenever the channel is configured.
  if (config.whatsapp.logRetentionDays > 0) {
    await schedulerQueue.add(
      WHATSAPP_LOG_PURGE_JOB,
      {},
      {
        repeat: { pattern: '30 3 * * *' },
        jobId: WHATSAPP_LOG_PURGE_JOB,
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
    console.log(
      `[scheduler] WhatsApp log purge scheduled (nightly, keeping ${config.whatsapp.logRetentionDays} days)`,
    );
  }

  // Ongoing transaction monitoring. Runs as a sweep rather than inside the
  // payment path, so it can never slow or fail a customer's money movement,
  // and so a money path added later is covered without anyone remembering to
  // call anything. Every 15 minutes is near-real-time for an AML queue that a
  // human works, and light enough to be invisible.
  await schedulerQueue.add(
    AML_MONITOR_JOB,
    {},
    {
      repeat: { pattern: '*/15 * * * *' },
      jobId: AML_MONITOR_JOB,
      removeOnComplete: true,
      removeOnFail: 50,
    },
  );
  console.log('[scheduler] AML transaction monitoring scheduled (every 15 minutes)');

  // Data retention. Nightly, well away from the backup window so a purge and a
  // dump never contend for the same database.
  await schedulerQueue.add(
    RETENTION_JOB,
    {},
    {
      repeat: { pattern: '45 4 * * *' },
      jobId: RETENTION_JOB,
      removeOnComplete: true,
      removeOnFail: 50,
    },
  );
  console.log('[scheduler] data retention scheduled (nightly 04:45)');

  // Ledger reconciliation. Every stored wallet balance is checked against the
  // sum of its own transactions. Hourly rather than nightly: a balance that has
  // drifted from its ledger is money that is wrong, and the gap between it
  // happening and somebody knowing should be measured in minutes, not a day.
  await schedulerQueue.add(
    LEDGER_RECONCILE_JOB,
    {},
    {
      repeat: { pattern: '20 * * * *' },
      jobId: LEDGER_RECONCILE_JOB,
      removeOnComplete: true,
      removeOnFail: 50,
    },
  );
  console.log('[scheduler] ledger reconciliation scheduled (hourly)');
}

/** Start the worker that runs scheduled jobs when they fire. */
export function startSchedulerWorker(): Worker {
  if (schedulerWorker) return schedulerWorker;
  schedulerWorker = new Worker(
    SCHEDULER_QUEUE,
    async (job) => {
      if (job.name === WEEKLY_DIGEST_JOB) {
        const { DigestService } = await import('../digest/digest.service');
        await DigestService.runWeeklyBroadcast();
      } else if (job.name === DELIVERY_REMINDER_JOB) {
        const { ReminderService } = await import('../reminder/reminder.service');
        await ReminderService.runDueSoonReminders();
      } else if (job.name === PAYMENT_RECONCILE_JOB) {
        const { PaymentReconciliationService } = await import(
          '../payments/application/payment-reconciliation.service'
        );
        await PaymentReconciliationService.runOnce();
      } else if (job.name === CAMPAIGN_SEND_JOB) {
        const { runCampaignBatch, finishCampaign, batchDelayMs } = await import(
          '../whatsappadmin/campaign-queue'
        );
        const campaignId = (job.data as { campaignId: string }).campaignId;
        const outcome = await runCampaignBatch(campaignId);
        if (outcome.more) {
          // The pace lives here: the next message is scheduled, not slept for.
          // A rate limit means the configured pace is too fast for whatever the
          // provider is currently enforcing, so the gap triples rather than
          // repeating the interval that just got refused.
          const delay = outcome.backOff ? batchDelayMs() * 3 : batchDelayMs();
          await enqueueCampaignBatch(campaignId, delay);
        } else {
          await finishCampaign(campaignId);
        }
      } else if (job.name === DORMANCY_JOB) {
        const { sendDueNotices, alertOperatorsIfDue } = await import(
          '../retention/dormancy.notices'
        );
        const notices = await sendDueNotices();
        const eligible = await alertOperatorsIfDue();
        console.log(
          `[dormancy] ${notices.sent} warning(s) sent, ${eligible} account(s) awaiting an operator`,
        );
      } else if (job.name === PAYOUT_FLOAT_JOB) {
        const { checkPayoutFloat } = await import('../payments/application/payout-float');
        await checkPayoutFloat();
      } else if (job.name === LEDGER_RECONCILE_JOB) {
        const { reconcileAndAlert } = await import('./wallet-reconciliation');
        const result = await reconcileAndAlert();
        if (result.drifted.length) {
          console.error(
            `[ledger] ${result.drifted.length} of ${result.walletsChecked} wallet(s) ` +
              `DISAGREE with their ledger - total drift ${result.totalDrift}`,
          );
        } else {
          console.log(`[ledger] ${result.walletsChecked} wallet(s) reconcile exactly`);
        }
      } else if (job.name === RETENTION_JOB) {
        const { runRetention } = await import('./retention');
        const outcomes = await runRetention();
        const removed = outcomes.reduce((sum, outcome) => sum + outcome.deleted, 0);
        // Always logged, even at zero. A deletion job that runs silently is one
        // nobody notices has stopped - or has started taking far more than it
        // should.
        console.log(
          `[retention] purged ${removed} row(s): ` +
            outcomes.map((outcome) => `${outcome.table}=${outcome.deleted}`).join(' '),
        );
      } else if (job.name === AML_MONITOR_JOB) {
        const { runTransactionMonitor } = await import('../aml/transaction-monitor');
        const result = await runTransactionMonitor();
        // Logged even when nothing fires: silence from a detection system must
        // never be ambiguous between "nothing happened" and "nothing ran".
        if (result.raised.length) {
          console.warn(
            `[aml] monitoring opened ${result.raised.length} case(s) from ${result.scanned} movement(s): ` +
              result.raised.map((entry) => entry.type).join(', '),
          );
        } else {
          console.log(`[aml] monitoring swept ${result.scanned} movement(s), nothing to report`);
        }
      } else if (job.name === WHATSAPP_LOG_PURGE_JOB) {
        const { WhatsAppRepository } = await import('../whatsapp/whatsapp.repository');
        const removed = await WhatsAppRepository.purgeMessagesOlderThan(
          config.whatsapp.logRetentionDays,
        );
        if (removed > 0) console.log(`[scheduler] purged ${removed} WhatsApp message log rows`);
      }
    },
    { connection: bullConnection },
  );
  schedulerWorker.on('ready', () => console.log('[scheduler] worker ready'));
  schedulerWorker.on('failed', (job, err) =>
    console.error(`[scheduler] job ${job?.name} failed:`, err.message),
  );
  return schedulerWorker;
}
