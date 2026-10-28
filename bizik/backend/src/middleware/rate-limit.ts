import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

import { redis } from '../lib/redis';

/**
 * Stricter per-IP limiter for credential / OTP / password-reset endpoints. The
 * global limiter is deliberately loose (a screen load fans out many requests);
 * this one throttles brute-force logins and OTP/reset abuse specifically.
 * Tune with AUTH_RATE_LIMIT_MAX (default 30 requests / 15 min per IP).
 */
export const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  // Own key prefix: sharing one with the global limiter let a request to any
  // other route set this limiter's window (see index.ts).
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.sendCommand(args),
    prefix: 'rl:auth:',
  }),
  message: { error: { code: 'Q-429', message: 'Too many attempts. Please try again later.' } },
});

/**
 * Directory lookups (phone number or @handle -> account holder's name). The app
 * calls these while someone types a recipient, so the budget is generous, but
 * unthrottled they are an identity oracle: an attacker could walk number ranges
 * and harvest real names. Tune with LOOKUP_RATE_LIMIT_MAX.
 */
export const lookupLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: Number(process.env.LOOKUP_RATE_LIMIT_MAX) || 120,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.sendCommand(args),
    prefix: 'rl:lookup:',
  }),
  message: { error: { code: 'Q-429', message: 'Too many lookups. Please slow down.' } },
});
