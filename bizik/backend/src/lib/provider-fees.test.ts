import { beforeEach, describe, expect, it } from 'vitest';

import { feeVariance, quoteProviderFee } from './provider-fees';
import { systemSettings } from './system-settings';

/**
 * The rail's cut, and the arithmetic the wallet depends on.
 *
 * Every number here is money. The rule being pinned is that the user's wallet
 * figure is the figure they asked for and the rail's cut rides on top - the
 * behaviour this replaced credited 250 for a 250 deposit while only 242
 * arrived, so the platform lost 3.2% on every top-up with nothing recording it.
 */
const feeSettings = systemSettings().providers.providerFees as {
  chargeOnDeposit: boolean;
  chargeOnWithdrawal: boolean;
  depositRate: number;
  withdrawalRate: number;
  depositMinimumXaf: number;
  withdrawalMinimumXaf: number;
};

describe('provider fees', () => {
  beforeEach(() => {
    // Fapshi's published standard pricing: 3% on collections, 0% on payouts.
    feeSettings.chargeOnDeposit = true;
    feeSettings.chargeOnWithdrawal = false;
    feeSettings.depositRate = 0.03;
    feeSettings.withdrawalRate = 0;
    feeSettings.depositMinimumXaf = 0;
    feeSettings.withdrawalMinimumXaf = 0;
  });

  it('charges NOTHING on a withdrawal, because Fapshi charges nothing for payouts', () => {
    // "0% for payouts (withdrawals)" and "No withdrawal fees" on
    // fapshi.com/pricing. An estimate of 3% here was briefly live, which would
    // have taken 3 XAF from the user on every 100 XAF withdrawal for a cost the
    // rail never charges - overcharging is as much a defect as under-charging.
    const quote = quoteProviderFee(100, 'withdrawal');
    expect(quote.fee).toBe(0);
    expect(quote.total).toBe(100);
    expect(quote.amount).toBe(100);
  });

  it('reproduces the live transaction that exposed the problem', () => {
    // Fapshi reported amount 250, revenue 242: it kept 8 on a 250 collection.
    // At 3% the estimate is 7.5, which must round UP to 8 and not down to 7.
    const quote = quoteProviderFee(250, 'deposit');

    expect(quote.fee).toBe(8);
    expect(quote.total).toBe(258);
    expect(quote.amount).toBe(250);
  });

  it('keeps the wallet figure exactly what was asked for', () => {
    // The whole point: whatever the fee, `amount` is untouched. Anything that
    // reads this to credit a wallet credits what the user asked for.
    for (const amount of [100, 250, 1000, 7777]) {
      expect(quoteProviderFee(amount, 'deposit').amount).toBe(amount);
      expect(quoteProviderFee(amount, 'withdrawal').amount).toBe(amount);
    }
  });

  it('rounds the fee UP, so a rounding difference never leaves us short', () => {
    // 100 x 3% = 3 exactly; 101 x 3% = 3.03, which must cost 4 rather than 3.
    expect(quoteProviderFee(100, 'deposit').fee).toBe(3);
    expect(quoteProviderFee(101, 'deposit').fee).toBe(4);
  });

  it('never returns a fractional fee, because XAF has no subunit', () => {
    for (const amount of [33, 101, 257, 999, 1234]) {
      const { fee, total } = quoteProviderFee(amount, 'deposit');
      expect(Number.isInteger(fee)).toBe(true);
      expect(Number.isInteger(total)).toBe(true);
    }
  });

  it('applies a floor, because percentage rails carry one', () => {
    feeSettings.depositMinimumXaf = 25;
    // 1% of 100 is 1, well under the floor.
    feeSettings.depositRate = 0.01;
    expect(quoteProviderFee(100, 'deposit').fee).toBe(25);
  });

  it('charges nothing when the platform chooses to absorb it', () => {
    feeSettings.chargeOnDeposit = false;
    const quote = quoteProviderFee(250, 'deposit');
    expect(quote.fee).toBe(0);
    expect(quote.total).toBe(250);
  });

  it('deposit and withdrawal are configured independently', () => {
    // Set up the mirror image of the live configuration, so a change to one
    // cannot silently move the other.
    feeSettings.chargeOnDeposit = false;
    feeSettings.chargeOnWithdrawal = true;
    feeSettings.withdrawalRate = 0.02;
    expect(quoteProviderFee(250, 'deposit').fee).toBe(0);
    expect(quoteProviderFee(250, 'withdrawal').fee).toBe(5);
  });

  it('charges nothing in a currency we have no figure for', () => {
    // Fees are configured for the XAF rails. Inventing a charge on a currency
    // we do not understand is worse than absorbing a cost we do.
    expect(quoteProviderFee(250, 'deposit', undefined, 'EUR').fee).toBe(0);
    expect(quoteProviderFee(250, 'withdrawal', undefined, 'USD').fee).toBe(0);
  });

  describe('variance against what the rail really took', () => {
    it('is zero when the estimate was right', () => {
      expect(feeVariance(8, 8)).toBe(0);
    });

    it('is positive when the rail took more than we charged', () => {
      // The direction that costs the platform money on every transaction.
      expect(feeVariance(8, 12)).toBe(4);
    });

    it('is negative when we over-charged', () => {
      // The direction that costs the USER money, which matters just as much.
      expect(feeVariance(12, 8)).toBe(-4);
    });
  });
});
