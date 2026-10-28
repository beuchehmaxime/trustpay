import { Currency, User } from '@prisma/client';

import { prisma } from './prisma';

/**
 * Provision a new account's empty multi-currency wallet (SRS FR-PAY-007).
 *
 * A brand-new user starts with ZERO balances and NO activity - no contracts,
 * transactions or payout methods. Those appear only as the user actually
 * transacts. We just create the (empty) currency wallets so the wallet screen
 * has the multi-currency structure to show. Idempotent.
 */
const CURRENCIES: Currency[] = ['USD', 'EUR', 'GBP', 'NGN', 'GHS', 'XAF'];

export async function provisionUserWallets(user: User): Promise<void> {
  const existing = await prisma.wallet.count({ where: { userId: user.id } });
  if (existing > 0) return;

  await prisma.wallet.createMany({
    data: CURRENCIES.map((currency) => ({
      userId: user.id,
      currency,
      balance: 0,
      pendingBalance: 0,
    })),
  });
}
