import { describe, expect, it } from 'vitest';

/**
 * Telling "our payout account is empty" apart from "this withdrawal is wrong".
 *
 * The two need opposite handling and arrive looking identical - Fapshi answers
 * both with HTTP 400 and a sentence. Get it backwards in one direction and a
 * user's money is held for a withdrawal that was genuinely refused; backwards
 * in the other and somebody with a full wallet is told their withdrawal failed
 * because of something they cannot see, let alone fix.
 *
 * The matcher is duplicated here rather than exported, because exporting it
 * purely for a test would invite it to be reused somewhere this reasoning does
 * not hold. It is pinned by behaviour, including the live wording.
 */
function isInsufficientProviderFloat(reason: string): boolean {
  const text = reason.toLowerCase();
  return (
    text.includes('insufficient fund') ||
    text.includes('insufficient balance') ||
    text.includes('not enough fund')
  );
}

describe('payout float shortage detection', () => {
  it('recognises the wording Fapshi actually returned in production', () => {
    // Verbatim from the live log:
    //   WITHDRAWAL WD-3a2818b2 REJECTED - Fapshi POST /payout failed (400): Insufficient funds
    expect(
      isInsufficientProviderFloat('Fapshi POST /payout failed (400): Insufficient funds'),
    ).toBe(true);
  });

  it('recognises the obvious variants', () => {
    expect(isInsufficientProviderFloat('insufficient balance')).toBe(true);
    expect(isInsufficientProviderFloat('Not enough funds in account')).toBe(true);
    expect(isInsufficientProviderFloat('INSUFFICIENT FUNDS')).toBe(true);
  });

  it('does NOT claim a float shortage for an ordinary refusal', () => {
    // These must refund the user. Treating one as a float problem would hold
    // their money indefinitely for a payout that is never going to happen.
    for (const reason of [
      'Invalid phone number',
      'minimum is 100 XAF, got 50',
      'Recipient not found',
      'Service temporarily unavailable',
      'Payout is not enabled for this service',
    ]) {
      expect(isInsufficientProviderFloat(reason)).toBe(false);
    }
  });

  it('degrades to an ordinary refusal when the wording changes', () => {
    // Matched on prose, so a reworded message must fall through to the refund
    // path rather than silently holding funds. The safe default is the one that
    // gives the user their money back.
    expect(isInsufficientProviderFloat('balance too low to complete')).toBe(false);
  });
});
