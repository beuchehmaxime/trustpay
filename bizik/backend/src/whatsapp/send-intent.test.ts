import { describe, expect, it } from 'vitest';

import { parseSendMoney } from './whatsapp-intent';

/**
 * The menu advertises "send 5000 to @handle", so that phrasing must work when
 * the model provider is unreachable - an outage there must never stop someone
 * paying a person they named explicitly. Parsing has to be certain, though: a
 * vague message is safer in the model's hands than acted on with money.
 */
describe('parseSendMoney', () => {
  it('reads the phrasing the menu promises', () => {
    expect(parseSendMoney('send 5000 to @maxime.ti')).toEqual({ to: '@maxime.ti', amount: 5000 });
    // Verbatim from the report, preamble and all.
    expect(parseSendMoney('Okay I want to send 50000 to @maxime.ti')).toEqual({
      to: '@maxime.ti',
      amount: 50000,
    });
  });

  it('copes with how people actually write amounts', () => {
    expect(parseSendMoney('send 50,000 to @maxime.ti')?.amount).toBe(50000);
    expect(parseSendMoney('send 50 000 to @maxime.ti')?.amount).toBe(50000);
    expect(parseSendMoney('transfer 2500 to @amara.okafor')?.amount).toBe(2500);
  });

  it('takes a currency when named, and leaves it to the caller otherwise', () => {
    expect(parseSendMoney('send 5000 XAF to @maxime.ti')?.currency).toBe('XAF');
    expect(parseSendMoney('send FCFA 5000 to @maxime.ti')?.currency).toBe('XAF');
    expect(parseSendMoney('send 20 usd to @maxime.ti')?.currency).toBe('USD');
    // No currency named → the caller fills in the sender's own.
    expect(parseSendMoney('send 5000 to @maxime.ti')?.currency).toBeUndefined();
  });

  it('accepts a phone number as the recipient', () => {
    expect(parseSendMoney('send 1000 to +237670010386')).toEqual({
      to: '+237670010386',
      amount: 1000,
    });
  });

  it('speaks French', () => {
    expect(parseSendMoney('envoyer 5000 à @maxime.ti')).toEqual({ to: '@maxime.ti', amount: 5000 });
    expect(parseSendMoney('envoie 2000 a @maxime.ti')?.amount).toBe(2000);
  });

  it('refuses anything it is not certain about', () => {
    // No recipient that looks like one - the model should ask who.
    expect(parseSendMoney('send 5000 to my brother')).toBeNull();
    expect(parseSendMoney('send money to @maxime.ti')).toBeNull();
    // Not a transfer at all.
    expect(parseSendMoney('send me my balance')).toBeNull();
    expect(parseSendMoney('what is my balance')).toBeNull();
    expect(parseSendMoney('')).toBeNull();
  });

  it('never mistakes a DEAL instruction for a transfer', () => {
    // Deals are escrow; transfers are irreversible. Confusing the two would be
    // the worst possible failure, so any deal word disqualifies the message.
    expect(parseSendMoney('send 5000 to fund the laptop deal')).toBeNull();
    expect(parseSendMoney('transfer 5000 to escrow for @maxime.ti')).toBeNull();
    expect(parseSendMoney('send 5000 to @maxime.ti for the invoice')).toBeNull();
  });
});
