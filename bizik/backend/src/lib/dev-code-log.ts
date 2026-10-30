import { config } from '../config/env';

/**
 * Print a one-time code to the server log, for a stack with nowhere to send it.
 *
 * This exists for one reason: on a demo stack there is no real mailbox and no
 * real phone, so a code that is only ever delivered is a code nobody can use,
 * and the admin console becomes unreachable. It is a development aid and it is
 * written to be impossible to leave on by accident.
 *
 * Three things have to be true before anything is printed:
 *
 *   1. LOG_VERIFICATION_CODES is explicitly "true". No default, no clever
 *      inference from NODE_ENV - this stack runs NODE_ENV=production in its
 *      compose file, so that check would be worse than useless here.
 *   2. PAYMENTS_MODE is "simulated". A stack wired to a live money rail is not
 *      a demo stack whatever its flags say, and this is the honest signal of
 *      which one you are on.
 *   3. The code is still delivered normally as well. This prints in addition
 *      to sending, never instead of it, so turning the flag off does not
 *      quietly break anything.
 *
 * What it does NOT do is weaken the check itself. The code is still random,
 * still hashed before it is stored, still expires, and still rate-limited.
 * The only thing that changes is that a developer can read it.
 */

/** Whether codes may be printed at all. Evaluated once, at import. */
export const DEV_CODE_LOGGING =
  process.env.LOG_VERIFICATION_CODES === 'true' && config.payments.mode === 'simulated';

/**
 * Say loudly, once, at boot, that this is on.
 *
 * A security property that has been turned off should never be something you
 * have to go looking for in a config file.
 */
export function warnIfCodeLoggingEnabled(): void {
  if (!DEV_CODE_LOGGING) return;
  console.warn(
    '[security] ⚠ VERIFICATION CODES ARE BEING PRINTED TO THIS LOG ' +
      '(LOG_VERIFICATION_CODES=true). Anyone who can read these logs can sign in as staff. ' +
      'This is for local demo stacks only - remove it before any deployment that matters.',
  );
}

/**
 * Print one code.
 *
 * `target` is logged as given, because the whole value of this line is being
 * able to tell which of several demo accounts a code belongs to. That is also
 * precisely why it never runs anywhere real.
 */
export function logDevCode(kind: string, target: string, code: string): void {
  if (!DEV_CODE_LOGGING) return;
  console.warn(`[dev-code] ${kind} for ${target}: ${code}`);
}
