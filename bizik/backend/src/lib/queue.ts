import { Queue } from 'bullmq';

import { config } from '../config/env';

/**
 * BullMQ Redis connection options, parsed from REDIS_URL. Passing plain options
 * (rather than a shared ioredis instance) lets BullMQ create and tune its own
 * connections (blocking clients need `maxRetriesPerRequest: null`, which BullMQ
 * sets internally when it owns the connection).
 */
function redisConnection() {
  const url = new URL(config.redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    ...(url.password ? { password: url.password } : {}),
  };
}

export const bullConnection = redisConnection();

export const EMAIL_QUEUE = 'email';

/** Weekly-digest stats payload (kept in sync with digest.service `DigestStats`). */
export interface DigestStatsPayload {
  firstName: string;
  projectsTotal: number;
  projectsCompleted: number;
  projectsActive: number;
  transactions: number;
  protectedLabel: string;
  homeCurrency: string;
}

/** Payloads accepted by the email worker. */
export type EmailJobData =
  | { kind: 'admin-mfa'; to: string; name: string; code: string }
  | { kind: 'generic'; to: string; subject: string; body: string }
  | { kind: 'weekly-digest'; to: string; name: string; stats: DigestStatsPayload };

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE, {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 200,
    removeOnFail: 500,
  },
});

/** Enqueue an email to be delivered by the background worker (BullMQ). */
export async function enqueueEmail(data: EmailJobData): Promise<void> {
  await emailQueue.add(data.kind, data);
}
