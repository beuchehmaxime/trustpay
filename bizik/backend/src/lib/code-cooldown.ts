import { AppError } from './errors';
import { redis } from './redis';
import { maskNumber } from './sms-providers/types';

/**
 * How often a one-time code may be sent to the same number, and how long the
 * caller must wait when it may not.
 *
 * Every code is a real message that costs money and lands on someone's phone,
 * so resends have always been capped. What was missing is that the cap was
 * SILENT: a refused send returned nothing, the API still answered "we sent you
 * a code", and the user sat on the OTP screen watching for a message that was
 * never going to arrive. "The code never came" and "we never sent one" looked
 * identical from the outside.
 *
 * So two things here. The wait escalates - a first resend is a mistyped number
 * or a slow network, a third is someone hammering the button or a script - and
 * the refusal is always RETURNED, never swallowed, so the caller can say how
 * long to wait instead of showing a dead screen.
 *
 *   send 1 (the first code)      immediate
 *   send 2 (the first resend)    1 minute after send 1
 *   send 3 and every one after   5 minutes after the previous send
 *
 * The escalation is per SCOPE (signing in, resetting a password, proving a
 * payout number) because those are different jobs and one must not starve
 * another. The daily ceiling is deliberately NOT per scope: it is one number's
 * total exposure to us, whatever the reason.
 */

/** Wait after the first code, when a resend is most likely to be legitimate. */
export const FIRST_RESEND_WAIT_SECONDS = 60;
/** Wait after that. Deliberately long - by the third code something is wrong. */
export const LATER_RESEND_WAIT_SECONDS = 5 * 60;
/** Total codes to one number per day, across every scope. */
export const MAX_CODES_PER_DAY = 10;
/**
 * How long the send counter lives. Long enough that the escalation is not
 * reset by waiting out a single cooldown, short enough that someone who comes
 * back tomorrow - or an hour later - starts fresh rather than being punished
 * for a flow they abandoned.
 */
const SEND_COUNT_TTL_SECONDS = 60 * 60;

/** The flows that send codes. Each escalates on its own. */
export type CodeScope = 'phone-verification' | 'password-reset' | 'payout-method';

const cooldownKey = (scope: CodeScope, target: string) => `otp:cooldown:${scope}:${target}`;
const sendCountKey = (scope: CodeScope, target: string) => `otp:sends:${scope}:${target}`;
const dailyKey = (target: string) => `otp:daily:${target}`;

export type CodeSendClaim =
  | { allowed: true; nextWaitSeconds: number }
  | { allowed: false; retryAfterSeconds: number; reason: 'cooldown' | 'daily_cap' };

/**
 * Claim the right to send one code, or find out how long to wait.
 *
 * Call this BEFORE generating a code, and send only when `allowed`. On refusal
 * the result carries the exact number of seconds, which is meant to reach the
 * user - that is the whole point of this module.
 */
export async function claimCodeSend(scope: CodeScope, target: string): Promise<CodeSendClaim> {
  const remaining = await redis.ttl(cooldownKey(scope, target));
  if (remaining > 0) {
    console.log(
      `[code] ${scope}: not sent to ${maskNumber(target)} - ${remaining}s left on the cooldown`,
    );
    return { allowed: false, retryAfterSeconds: remaining, reason: 'cooldown' };
  }

  const sentToday = await redis.incr(dailyKey(target));
  if (sentToday === 1) await redis.expire(dailyKey(target), 24 * 60 * 60);
  if (sentToday > MAX_CODES_PER_DAY) {
    const resetsIn = await redis.ttl(dailyKey(target));
    console.warn(
      `[code] ${scope}: not sent to ${maskNumber(target)} - ${MAX_CODES_PER_DAY} codes already today`,
    );
    return {
      allowed: false,
      // A negative TTL means the key has no expiry set, which should not happen
      // - fall back to a full day rather than telling the user to retry now.
      retryAfterSeconds: resetsIn > 0 ? resetsIn : 24 * 60 * 60,
      reason: 'daily_cap',
    };
  }

  // Which send this is decides the NEXT wait, so the first code goes out
  // immediately and only the resends are slowed down.
  const sendNumber = await redis.incr(sendCountKey(scope, target));
  await redis.expire(sendCountKey(scope, target), SEND_COUNT_TTL_SECONDS);
  const nextWaitSeconds =
    sendNumber <= 1 ? FIRST_RESEND_WAIT_SECONDS : LATER_RESEND_WAIT_SECONDS;
  await redis.set(cooldownKey(scope, target), '1', { EX: nextWaitSeconds });

  return { allowed: true, nextWaitSeconds };
}

/**
 * How long until this scope will send another code, or 0 if it would send now.
 *
 * For callers that need to report the wait without consuming a send - the
 * login response, which has to say "you still need to verify" whether or not a
 * fresh code went out with it.
 */
export async function codeSendWaitSeconds(scope: CodeScope, target: string): Promise<number> {
  const remaining = await redis.ttl(cooldownKey(scope, target));
  return remaining > 0 ? remaining : 0;
}

/**
 * Forget the escalation for this scope.
 *
 * Called once a code is successfully used. Without it, somebody who needed
 * three codes to get in today would still be on the five-minute wait the next
 * time they legitimately need one, having done nothing wrong.
 */
export async function clearCodeCooldown(scope: CodeScope, target: string): Promise<void> {
  await redis.del(cooldownKey(scope, target));
  await redis.del(sendCountKey(scope, target));
}

/**
 * Turn a wait into something a person can act on.
 *
 * Rounded up to whole minutes above a minute and a half, because "wait 4
 * minutes" is a sentence and "wait 237 seconds" is arithmetic homework.
 */
export function describeWait(seconds: number): string {
  if (seconds <= 90) return `${Math.max(1, Math.ceil(seconds))} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/**
 * The error an explicit resend gets when it is too soon.
 *
 * One shared builder so every flow refuses in the same words and carries
 * `retryAfterSeconds` - which the error middleware turns into a `Retry-After`
 * header, and the clients turn into a live countdown.
 */
export function codeCooldownError(refusal: {
  retryAfterSeconds: number;
  reason: 'cooldown' | 'daily_cap';
}): AppError {
  const message =
    refusal.reason === 'daily_cap'
      ? 'You have requested too many codes today. Please try again tomorrow or contact support.'
      : `Please wait ${describeWait(refusal.retryAfterSeconds)} before asking for another code.`;
  return new AppError(429, 'Q-429-CODE-COOLDOWN', message, {
    retryAfterSeconds: refusal.retryAfterSeconds,
  });
}
