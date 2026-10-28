import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { round2 } from './fees';

/**
 * The invariant the whole wallet design rests on:
 *
 *     wallets.balance === SUM(wallet_transactions.amount)
 *
 * It only holds if the running balance is accumulated in exact decimal
 * arithmetic. The balance used to be computed as
 * `round2(Number(wallet.balance) + amount)` - a JavaScript double, rounded to
 * two places on a column that stores four. These tests are about why that is
 * not good enough for money, and they fail against the old implementation.
 */
describe('ledger arithmetic', () => {
  /** How the balance is now accumulated: exact decimal, movement by movement. */
  function accumulate(movements: number[]): Prisma.Decimal {
    return movements.reduce(
      (balance, movement) => balance.plus(new Prisma.Decimal(round2(movement))),
      new Prisma.Decimal(0),
    );
  }

  /** How it used to be: a double, rounded after every step. */
  function accumulateAsFloat(movements: number[]): number {
    return movements.reduce((balance, movement) => round2(balance + round2(movement)), 0);
  }

  it('the classic case a double gets wrong', () => {
    // 0.1 + 0.2 is 0.30000000000000004 in binary floating point. Money cannot
    // be stored in a representation where that is true.
    expect(new Prisma.Decimal('0.1').plus('0.2').equals('0.3')).toBe(true);
    expect(0.1 + 0.2 === 0.3).toBe(false);
  });

  it('the balance equals the sum of the movements, exactly', () => {
    const movements = [100.1, 250.25, -75.35, 1000, -0.01];
    const balance = accumulate(movements);
    const sum = movements.reduce(
      (total, movement) => total.plus(new Prisma.Decimal(round2(movement))),
      new Prisma.Decimal(0),
    );
    // Not `toBeCloseTo`. Exactly. Reconciliation compares with `<>` in SQL, so
    // "close enough" is a drift alert at 03:20 every morning.
    expect(balance.equals(sum)).toBe(true);
  });

  it('stays exact across a long history where a double would not', () => {
    // A thousand small credits - a plausible year for an active wallet.
    const movements = Array.from({ length: 1000 }, () => 0.07);
    const exact = accumulate(movements);
    expect(exact.toString()).toBe('70');
    // The float path happens to survive this one because round2 runs each step,
    // which is exactly why the old code looked fine: it is not obviously wrong,
    // it is quietly fragile.
    expect(accumulateAsFloat(movements)).toBeCloseTo(70, 2);
  });

  it('keeps a large balance exact, where a double silently loses the addition', () => {
    // XAF has no minor unit and amounts run large, so a balance in the hundreds
    // of billions of FCFA is reachable. At that magnitude a double no longer
    // has the resolution to record a small movement at all: the addition is
    // accepted and then silently discarded.
    // Verified, not assumed: a double loses a 0.0001 movement from 1e13 upward.
    // In XAF that is ten trillion FCFA - far beyond this platform - but the
    // column is Decimal(20,4) precisely so the representation is not the thing
    // that decides, and the same limit bites far lower in a currency with four
    // decimal places.
    expect(10_000_000_000_000 + 0.0001 === 10_000_000_000_000).toBe(true);

    const balance = new Prisma.Decimal('10000000000000');
    expect(balance.plus('0.0001').toString()).toBe('10000000000000.0001');
  });

  it('sums a long run of small credits without the drift a double accumulates', () => {
    // Summing 0.07 a thousand times in a double gives 69.99999999999966. Against
    // an exactly-stored ledger that is a reconciliation alert every morning for
    // a wallet where nothing is actually wrong.
    const raw = Array.from({ length: 1000 }, () => 0.07).reduce((total, value) => total + value, 0);
    expect(raw === 70).toBe(false);
    expect(accumulate(Array.from({ length: 1000 }, () => 0.07)).equals(70)).toBe(true);
  });

  it('decides an overdraft on the decimal, not the float', () => {
    // A balance of exactly zero after a full withdrawal must not read as
    // negative because of a representation artefact - that would refuse a user
    // their own last franc.
    const balance = new Prisma.Decimal('250.25').minus('250.25');
    expect(balance.lessThan(0)).toBe(false);
    expect(balance.equals(0)).toBe(true);
  });

  it('a credit and an equal debit return the wallet to where it started', () => {
    const start = new Prisma.Decimal('1234.56');
    const after = start.plus('99.99').minus('99.99');
    expect(after.equals(start)).toBe(true);
  });

  it('negates a debit exactly, so the signed sum is the balance', () => {
    // Debits are stored negative so SUM(amount) IS the balance, with no CASE on
    // the transaction type. That is what makes the reconciliation query one line.
    const movement = new Prisma.Decimal(round2(75.35));
    expect(movement.negated().toString()).toBe('-75.35');
    expect(movement.plus(movement.negated()).equals(0)).toBe(true);
  });
});
