import type { FailedAction, PendingAction } from './whatsapp-session';

/**
 * Stops the assistant re-offering an action that just failed.
 *
 * When a payment fails and the user reacts - "my payment API is down", "that
 * didn't work" - the model reads it as context for the same request and happily
 * proposes the identical payment again. Telling it not to helps, but wording is
 * not a control: this is. An identical action within the cool-off is suppressed
 * and the real failure is repeated instead, unless the user plainly asks to try
 * again.
 */

const COOL_OFF_MS = 10 * 60 * 1000;

/** A stable fingerprint of an action, so "the same thing again" is detectable. */
export function actionKey(action: { tool: string; args: Record<string, unknown> }): string {
  const args = Object.keys(action.args)
    .sort()
    .map((key) => `${key}=${String(action.args[key] ?? '')}`)
    .join('&');
  return `${action.tool}|${args}`;
}

/**
 * A looser fingerprint: tool + amount + currency only. The recipient/target
 * string can differ between the failed attempt (what the user typed) and the
 * model's re-proposal (the resolved handle it read back from context), so the
 * strict key misses it. Amount + currency + tool is enough to recognise "the
 * same payment that just failed".
 */
export function looseActionKey(action: { tool: string; args: Record<string, unknown> }): string {
  const amount = action.args.amount ?? '';
  const currency = String(action.args.currency ?? '').toUpperCase();
  return `${action.tool}|amount=${String(amount)}|currency=${currency}`;
}

/** Did the user explicitly ask to try it again? Then let them. */
export function asksToRetry(text: string): boolean {
  // The French stems carry no trailing word boundary, so inflected forms
  // ("réessayer", "réessayez") count as a retry too.
  return /\b(?:try again|retry|again|re-?send|encore)\b|r[\u00e9e]essay/i.test(text.trim());
}

/**
 * Should this proposal be held back? True when it repeats an action that failed
 * within the cool-off and the user has not asked for a retry.
 */
export function shouldSuppressRepeat(
  pending: Pick<PendingAction, 'tool' | 'args'>,
  lastFailed: FailedAction | undefined,
  userText: string,
  now = Date.now(),
): boolean {
  if (!lastFailed) return false;
  if (now - lastFailed.at > COOL_OFF_MS) return false;
  if (asksToRetry(userText)) return false;
  if (actionKey(pending) === lastFailed.argsKey) return true;
  // Recipient string drift: same tool + amount + currency is the same payment.
  return !!lastFailed.looseKey && looseActionKey(pending) === lastFailed.looseKey;
}
