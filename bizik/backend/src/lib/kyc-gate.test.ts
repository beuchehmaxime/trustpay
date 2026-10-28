import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { isVerifiedTier } from './kyc-gate';

vi.mock('./system-settings', () => ({
  systemSettings: () => ({ verification: { standardTier: 2 } }),
}));

/**
 * The shape of the rule, stated once: value LEAVING an account is gated;
 * receiving never is. These exist so a future change has to break a test rather
 * than quietly strand someone's money behind a verification wall.
 */
describe('isVerifiedTier', () => {
  it('treats the platform standard tier as verified', () => {
    expect(isVerifiedTier(2)).toBe(true);
    expect(isVerifiedTier(3)).toBe(true);
  });

  it('treats anything below it as unverified', () => {
    expect(isVerifiedTier(0)).toBe(false);
    expect(isVerifiedTier(1)).toBe(false);
  });
});

describe('who the gate applies to', () => {
  it('gates the SENDER of a transfer, never the recipient', () => {
    const source = readFileSync('src/transfer/transfer.service.ts', 'utf8');
    // The sender is checked…
    expect(source).toMatch(/isVerifiedTier\(sender\.kycTier\)/);
    // …and the recipient is only ever checked for account STATUS, not KYC.
    const recipientBlock = source.slice(source.indexOf('const recipientAccount'), 400 + source.indexOf('const recipientAccount'));
    expect(recipientBlock).not.toMatch(/kycTier/);
  });

  it('gates both withdrawal rails on verification AND account status', () => {
    // `assertCanTransact` is the stronger gate: verified AND not frozen,
    // suspended or closed. A freeze that only stopped some rails was how a
    // frozen account could still empty its wallet.
    expect(readFileSync('src/wallet/wallet.service.ts', 'utf8')).toMatch(
      /assertCanTransact\(userId, 'withdraw'\)/,
    );
    expect(readFileSync('src/payments/application/payment.service.ts', 'utf8')).toMatch(
      /assertCanTransact\(input\.userId, 'withdraw'\)/,
    );
  });

  it('refuses a currency or destination the rail cannot settle', () => {
    // Fapshi settles XAF only and its API carries no currency field, so a
    // wallet debited in another currency would be paid out in XAF units.
    const payments = readFileSync('src/payments/application/payment.service.ts', 'utf8');
    expect(payments).toMatch(/assertRailCanSettle\(provider, input\.amount, input\.currency, 'withdrawal'\)/);
    expect(payments).toMatch(/assertRailCanSettle\(provider, input\.amount, input\.currency, 'deposit'\)/);
    const adapter = readFileSync(
      'src/payments/infrastructure/fapshi/fapshi-payment-provider.ts',
      'utf8',
    );
    expect(adapter).toMatch(/assertXafWholeAmount/);
  });

  it('queues a withdrawal for an operator when no payout rail can pay', () => {
    // Fapshi collection and disbursement are separate services with separate
    // keys, so holding collection keys does not mean we can pay anyone. When we
    // cannot, the money stays reserved and an operator settles it by hand -
    // never simulated, never silently failed.
    const payments = readFileSync('src/payments/application/payment.service.ts', 'utf8');
    expect(payments).toMatch(/if \(!PaymentProviderFactory\.canDisburse\(provider\)\)/);
    expect(payments).toMatch(/settleWithdrawalManually/);
    const factory = readFileSync('src/payments/application/payment-provider.factory.ts', 'utf8');
    expect(factory).toMatch(/isPayoutConfigured\(\)/);
  });

  it('never simulates a live payment', () => {
    // The simulator reports success without moving money: in live mode that
    // would credit a wallet nobody paid into, or tell a user they were paid.
    const factory = readFileSync('src/payments/application/payment-provider.factory.ts', 'utf8');
    expect(factory).toMatch(/refuseSimulatedPayout/);
    expect(factory).toMatch(/refuseSimulatedCollection/);
  });

  it('leaves receiving money ungated', () => {
    // completeDeposit credits a wallet - it must never require verification.
    const payments = readFileSync('src/payments/application/payment.service.ts', 'utf8');
    const completeDeposit = payments.slice(payments.indexOf('async completeDeposit'));
    expect(completeDeposit.slice(0, 1200)).not.toMatch(/assertVerified/);
  });
});
