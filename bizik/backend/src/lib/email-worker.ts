import { Worker } from 'bullmq';

import { bullConnection, EMAIL_QUEUE, type EmailJobData } from './queue';
import { sendAdminMfaCode, sendEmail, sendWeeklyDigest } from './notify';

let worker: Worker<EmailJobData> | null = null;

/**
 * Background email worker. Runs in-process alongside the API (monolith phase);
 * split into its own process when scaling. Delivers each queued email via the
 * shared nodemailer transport, with BullMQ handling retries/backoff.
 */
export function startEmailWorker(): Worker<EmailJobData> {
  if (worker) return worker;

  worker = new Worker<EmailJobData>(
    EMAIL_QUEUE,
    async (job) => {
      const data = job.data;
      switch (data.kind) {
        case 'admin-mfa':
          await sendAdminMfaCode(data.to, data.code, data.name);
          break;
        case 'generic':
          await sendEmail(data.to, data.subject, data.body);
          break;
        case 'weekly-digest':
          await sendWeeklyDigest(data.to, data.name, data.stats);
          break;
      }
    },
    { connection: bullConnection, concurrency: 5 },
  );

  worker.on('ready', () => console.log('[email-worker] ready'));
  worker.on('failed', (job, err) =>
    console.error(`[email-worker] job ${job?.id} failed:`, err.message),
  );

  return worker;
}
