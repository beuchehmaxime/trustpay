import { createClient } from 'redis';

import { config } from '../config/env';

/**
 * Shared Redis client - used for rate limiting, login lockouts, OTPs, email
 * verification tokens, 2FA challenges, and the revoked-session denylist.
 */
export const redis = createClient({ url: config.redisUrl });

redis.on('error', (err) => console.error('[redis] client error', err));

let connecting: Promise<unknown> | null = null;

/** Idempotently establish the Redis connection. */
export async function connectRedis(): Promise<void> {
  if (redis.isOpen) return;
  if (!connecting) connecting = redis.connect();
  await connecting;
}
