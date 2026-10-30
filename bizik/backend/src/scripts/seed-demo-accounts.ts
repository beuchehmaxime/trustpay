import bcrypt from 'bcryptjs';

import { config } from '../config/env';
import { PERMISSION_KEYS } from '../lib/permissions';
import { prisma } from '../lib/prisma';

/**
 * Three accounts to test the app with: one operator and two traders.
 *
 * Run it with:
 *
 *   docker compose exec backend node dist/scripts/seed-demo-accounts.js
 *
 * Idempotent: run it as often as you like. Existing accounts are updated in
 * place rather than duplicated, and the wallets are topped back up to their
 * starting balances so a demo can be reset between takes.
 *
 * These are DEMO credentials on a stack that cannot move real money
 * (PAYMENTS_MODE=simulated, no provider keys). They are printed at the end
 * because that is the whole point of the script. Nothing here should ever run
 * against a real deployment, and the guard below refuses to.
 *
 * `create-operator.ts` next door does the real version of the operator half:
 * it reads the password from the terminal and never prints it, so it stays out
 * of shell history and `ps`. That is the right tool for a live deployment and
 * this is not a replacement for it. The difference is deliberate - a seed whose
 * job is reproducible test accounts has to hand them over, which is exactly why
 * it refuses to run anywhere a real rail is configured.
 */

const PASSWORD = 'Demo1234!';

/** Starting wallet balance, in XAF, for each trader. */
const STARTING_BALANCE = 500_000;

interface TraderSpec {
  fullName: string;
  phone: string;
  username: string;
  locale: 'en' | 'fr';
}

const TRADERS: TraderSpec[] = [
  // One of each language, because the assistant switches on what it is told and
  // a demo with two English speakers never shows that.
  { fullName: 'Marie Ngo', phone: '+237670000001', username: 'marie.demo', locale: 'fr' },
  { fullName: 'Paul Mbarga', phone: '+237670000002', username: 'paul.demo', locale: 'en' },
];

const ADMIN = {
  fullName: 'Demo Operator',
  email: 'operator@trustpay.demo',
  phone: '+237670000009',
};

/**
 * Refuse to run anywhere that could be real.
 *
 * A script whose job is to create known-password accounts is a back door if it
 * ever reaches production. The payments mode is the honest signal: a stack
 * wired to a live rail is not a demo stack whatever its NODE_ENV says.
 */
function assertDemoStack(): void {
  if (config.payments?.mode && config.payments.mode !== 'simulated') {
    throw new Error(
      `Refusing to seed demo accounts: PAYMENTS_MODE is "${config.payments.mode}", not "simulated". ` +
        'This script creates accounts with a published password and must never run against a real stack.',
    );
  }
}

/**
 * Give a demo wallet its starting balance, through the ledger.
 *
 * The obvious version of this writes `balance` on the wallet row and stops.
 * That is wrong, and the platform catches it: `wallet-reconciliation.ts` proves
 * on a schedule that every stored balance equals the sum of its ledger, and
 * raises a CRITICAL alert when one does not. A balance set directly is exactly
 * the "money appeared with no ledger row" case it exists to find, so seeding
 * that way means every demo starts with a fabricated compliance incident in the
 * admin console.
 *
 * So the money is put in the way real money arrives: a ledger entry and a
 * balance that agrees with it, in one transaction. Re-running tops the wallet
 * back up to the same figure with an ADJUSTMENT for the difference, which is
 * what that transaction type is for, rather than silently rewriting history.
 */
async function fundWallet(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.upsert({
      where: { userId_currency: { userId, currency: 'XAF' } },
      create: { userId, currency: 'XAF', balance: 0, status: 'ACTIVE' },
      update: {},
    });

    const ledger = await tx.walletTransaction.aggregate({
      where: { walletId: wallet.id },
      _sum: { amount: true },
    });
    const currentLedger = Number(ledger._sum.amount ?? 0);
    const topUp = STARTING_BALANCE - currentLedger;
    if (topUp === 0) return;

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'ADJUSTMENT',
        amount: topUp,
        currency: 'XAF',
        balanceAfter: STARTING_BALANCE,
        referenceType: 'topup',
        description: 'Demo starting balance',
      },
    });
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: STARTING_BALANCE },
    });
  });
}

async function upsertTrader(spec: TraderSpec, passwordHash: string): Promise<string> {
  const user = await prisma.user.upsert({
    where: { phone: spec.phone },
    create: {
      fullName: spec.fullName,
      phone: spec.phone,
      username: spec.username,
      passwordHash,
      country: 'CM',
      locale: spec.locale,
      role: 'CLIENT',
      status: 'ACTIVE',
      // Tier 2 is the platform's "verified" bar: without it these accounts
      // cannot create a deal or send money, which is most of what there is to
      // test.
      kycTier: 2,
      phoneVerified: true,
      freelancerEnabled: true,
      termsAcceptedAt: new Date(),
      signupSource: 'seed',
    },
    update: {
      fullName: spec.fullName,
      username: spec.username,
      passwordHash,
      locale: spec.locale,
      status: 'ACTIVE',
      kycTier: 2,
      phoneVerified: true,
      freelancerEnabled: true,
    },
  });

  await fundWallet(user.id);
  return user.id;
}

async function upsertOperator(passwordHash: string): Promise<void> {
  const superRole =
    (await prisma.adminRole.findFirst({ where: { isSuperAdmin: true } })) ??
    (await prisma.adminRole.create({
      data: {
        name: 'Super Admin',
        description: 'Full, unrestricted access to every part of the platform.',
        isSuperAdmin: true,
        isSystem: true,
        permissions: PERMISSION_KEYS,
      },
    }));

  await prisma.user.upsert({
    where: { email: ADMIN.email },
    create: {
      fullName: ADMIN.fullName,
      email: ADMIN.email,
      phone: ADMIN.phone,
      passwordHash,
      country: 'CM',
      locale: 'en',
      role: 'ADMIN',
      status: 'ACTIVE',
      // Staff sign in with email, and the bootstrap refuses to promote an
      // account whose email was never verified.
      emailVerified: true,
      phoneVerified: true,
      adminRoleId: superRole.id,
      termsAcceptedAt: new Date(),
      signupSource: 'seed',
    },
    update: {
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
      adminRoleId: superRole.id,
    },
  });
}

async function main(): Promise<void> {
  assertDemoStack();

  const passwordHash = await bcrypt.hash(PASSWORD, config.bcryptRounds);

  await upsertOperator(passwordHash);
  for (const trader of TRADERS) await upsertTrader(trader, passwordHash);

  const traderLines = TRADERS.map(
    (trader) =>
      `  ${trader.phone}  @${trader.username}  ${trader.fullName} (${trader.locale})  ` +
      `${STARTING_BALANCE.toLocaleString('en-US')} XAF`,
  ).join('\n');

  console.log(`
Demo accounts ready. Password for all three: ${PASSWORD}

  User app      http://localhost:3000
${traderLines}

  Admin console http://localhost:3001
  ${ADMIN.email}  (Super Admin)

  Staff sign-in sends a 6-digit code by email. There is no bypass, and the
  code is stored hashed so it cannot be read back out of Redis. The stack
  runs its own mailbox instead - the code arrives at:

    http://localhost:8025
`);
}

main()
  .catch((error) => {
    console.error('[seed] failed:', (error as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
