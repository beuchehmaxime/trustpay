import { describe, expect, it } from 'vitest';

import { parseDeposit, parseSendMoney } from './whatsapp-intent';

/**
 * Adding your own money is the answer to "my wallet is empty", so it must work
 * without the model - and it must never be confused with the two things that
 * look similar: paying a PERSON, and funding a DEAL held in escrow.
 */
describe('parseDeposit', () => {
  it('reads the ways people ask to add money', () => {
    expect(parseDeposit('deposit 5000')).toEqual({ amount: 5000, currency: undefined });
    expect(parseDeposit('I want to top up 10000')?.amount).toBe(10000);
    expect(parseDeposit('add money 2500')?.amount).toBe(2500);
    expect(parseDeposit('recharge 1 500')?.amount).toBe(1500);
    expect(parseDeposit('fund my wallet 20000')?.amount).toBe(20000);
  });

  it('speaks French', () => {
    expect(parseDeposit('déposer 5000')?.amount).toBe(5000);
    expect(parseDeposit('recharger mon compte 3000')?.amount).toBe(3000);
  });

  it('recognises the intent even without an amount, so we can ask', () => {
    // Verbatim from the report - the reply should ask "how much?".
    expect(parseDeposit('I want to deposit')).toEqual({ amount: undefined, currency: undefined });
  });

  it('takes a named currency', () => {
    expect(parseDeposit('deposit 20 usd')?.currency).toBe('USD');
    expect(parseDeposit('top up 5000 FCFA')?.currency).toBe('XAF');
  });

  it('never mistakes a transfer or a deal for a top-up', () => {
    // Money to a PERSON is a transfer, and it is irreversible.
    expect(parseDeposit('add 5000 to @maxime.ti')).toBeNull();
    expect(parseSendMoney('send 5000 to @maxime.ti')).not.toBeNull();
    // Money into ESCROW is deal funding, which has its own flow.
    expect(parseDeposit('deposit 5000 into the laptop deal')).toBeNull();
    expect(parseDeposit('top up the escrow')).toBeNull();
  });

  it('ignores messages that are not about adding money', () => {
    expect(parseDeposit('my balance')).toBeNull();
    expect(parseDeposit('withdraw 5000')).toBeNull();
    expect(parseDeposit('')).toBeNull();
  });
});
