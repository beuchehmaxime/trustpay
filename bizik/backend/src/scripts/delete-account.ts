/**
 * Delete an end-user account by phone number.
 *
 * Written for clearing out test signups. It is deliberately hard to misuse,
 * because the same command that tidies up a throwaway account is the command
 * that erases a real customer.
 *
 * Three safeguards, in the order they matter:
 *
 *  1. It REFUSES any account that has financial history - a wallet balance, a
 *     ledger entry, a deal, a payout, a dispute, an AML alert. In a regulated
 *     product those rows are the audit trail, and deleting the person they
 *     belong to leaves orphaned money nobody can explain. If you genuinely need
 *     such an account gone, that is a data-retention decision with a legal
 *     answer, not a script.
 *  2. It is a DRY RUN unless you pass --confirm. Running it wrong shows you
 *     what would happen instead of doing it.
 *  3. It deletes in one transaction, so it cannot half-finish and leave the
 *     account in pieces.
 *
 * Audit log rows are never touched. They record what operators did, they are
 * not the user's data, and an audit trail that can be deleted by deleting its
 * subject is not an audit trail.
 *
 * Run inside the backend container:
 *   node dist/scripts/delete-account.js +237650035675              # dry run
 *   node dist/scripts/delete-account.js +237650035675 --confirm    # delete
 *   node dist/scripts/delete-account.js +23765... +23767... --confirm
 */
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Show enough of a number to recognise it, not enough to leak a list. */
function mask(phone: string): string {
  return phone.length > 4 ? `${'•'.repeat(phone.length - 4)}${phone.slice(-4)}` : phone;
}

/**
 * Tables that must be EMPTY for the account to be deletable, and the plain
 * sentence shown when they are not.
 */
const BLOCKING_CHECKS: { table: string; column: string; reason: string }[] = [
  { table: 'wallet_transactions', column: 'walletId', reason: 'ledger entries' },
  { table: 'contracts', column: 'counterpartyId', reason: 'deals as counterparty' },
  { table: 'payout_requests', column: 'userId', reason: 'payout requests' },
  { table: 'payment_transactions', column: 'userId', reason: 'payment transactions' },
  { table: 'fx_conversions', column: 'userId', reason: 'currency conversions' },
  { table: 'fee_records', column: 'payerId', reason: 'fees charged' },
  { table: 'payment_intents', column: 'payerId', reason: 'payment intents' },
  { table: 'aml_alerts', column: 'userId', reason: 'AML alerts' },
];

/**
 * Tables cleared when an account is deleted, in dependency order.
 *
 * Listed explicitly rather than discovered, because a loop over every table
 * with a `userId` column would quietly start deleting from any table added
 * later - including one somebody expected to be permanent.
 */
const DELETE_IN_ORDER: { table: string; column: string }[] = [
  { table: 'support_messages', column: 'senderId' },
  { table: 'support_tickets', column: 'userId' },
  { table: 'whatsapp_messages', column: 'userId' },
  { table: 'whatsapp_channels', column: 'userId' },
  { table: 'whatsapp_campaign_recipients', column: 'userId' },
  { table: 'notifications', column: 'userId' },
  { table: 'notification_preferences', column: 'userId' },
  { table: 'push_tokens', column: 'userId' },
  { table: 'consent_records', column: 'userId' },
  { table: 'analytics_events', column: 'userId' },
  { table: 'sanctions_screenings', column: 'userId' },
  { table: 'kyc_records', column: 'userId' },
  { table: 'profiles', column: 'userId' },
  { table: 'payout_methods', column: 'userId' },
  { table: 'wallets', column: 'userId' },
  { table: 'login_attempts', column: 'userId' },
  { table: 'oauth_accounts', column: 'userId' },
  { table: 'password_reset_tokens', column: 'userId' },
  { table: 'backup_codes', column: 'userId' },
  { table: '2fa_methods', column: 'userId' },
  { table: 'refresh_tokens', column: 'userId' },
  { table: 'sessions', column: 'userId' },
];

async function countRows(table: string, column: string, userId: string): Promise<number> {
  // Table and column names are from the constants above, never from input.
  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*) AS "count" FROM "${table}" WHERE "${column}" = $1`,
    userId,
  );
  return Number(rows[0]?.count ?? 0);
}

/** Ledger rows hang off the wallet, not the user, so they need the wallet ids. */
async function ledgerEntryCount(userId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) AS "count"
    FROM "wallet_transactions" t
    JOIN "wallets" w ON w."id" = t."walletId"
    WHERE w."userId" = ${userId}
  `;
  return Number(rows[0]?.count ?? 0);
}

async function fundedWalletCount(userId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) AS "count" FROM "wallets"
    WHERE "userId" = ${userId} AND ("balance" <> 0 OR "pendingBalance" <> 0)
  `;
  return Number(rows[0]?.count ?? 0);
}

async function processOne(phone: string, confirm: boolean): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    console.log(`\n${mask(phone)}  NOT FOUND - no account with that number.`);
    return false;
  }

  console.log(`\n${mask(phone)}  ${user.fullName}`);
  console.log(`  id          ${user.id}`);
  console.log(`  created     ${user.createdAt.toISOString()}`);
  console.log(`  status      ${user.status}, phoneVerified=${user.phoneVerified}, kycTier=${user.kycTier}`);

  // An operator account is never a test signup, and deleting one removes
  // somebody's access to the console along with the record of them having it.
  if (user.adminRoleId) {
    console.log('  REFUSED: this is a platform operator account. Remove the role in the admin console instead.');
    return false;
  }

  const blockers: string[] = [];
  const funded = await fundedWalletCount(user.id);
  if (funded > 0) blockers.push(`${funded} wallet(s) with a non-zero balance`);
  const ledger = await ledgerEntryCount(user.id);
  if (ledger > 0) blockers.push(`${ledger} ledger entries`);

  for (const check of BLOCKING_CHECKS) {
    if (check.table === 'wallet_transactions') continue; // counted above, via the wallet join
    const count = await countRows(check.table, check.column, user.id);
    if (count > 0) blockers.push(`${count} ${check.reason}`);
  }

  if (blockers.length) {
    console.log('  REFUSED: this account has financial history, which is the audit trail.');
    for (const blocker of blockers) console.log(`    - ${blocker}`);
    console.log('    Deleting it would leave money nobody can account for. Freeze the account instead.');
    return false;
  }

  // What would go, counted before anything is touched, so a dry run reports the
  // same numbers the real run will.
  const plan: { table: string; column: string; count: number }[] = [];
  for (const target of DELETE_IN_ORDER) {
    const count = await countRows(target.table, target.column, user.id);
    if (count > 0) plan.push({ ...target, count });
  }

  console.log(`  clean: no money, no deals. ${plan.length ? 'Rows to remove:' : 'Nothing but the account row.'}`);
  for (const row of plan) console.log(`    ${String(row.count).padStart(5)}  ${row.table}`);

  if (!confirm) {
    console.log('  DRY RUN - nothing deleted. Re-run with --confirm to delete.');
    return false;
  }

  await prisma.$transaction(async (tx) => {
    for (const target of DELETE_IN_ORDER) {
      await tx.$executeRawUnsafe(
        `DELETE FROM "${target.table}" WHERE "${target.column}" = $1`,
        user.id,
      );
    }
    await tx.$executeRaw`DELETE FROM "users" WHERE "id" = ${user.id}`;
  });

  console.log('  DELETED.');
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const phones = args.filter((arg) => !arg.startsWith('--'));

  if (phones.length === 0) {
    console.error('Usage: node dist/scripts/delete-account.js <phone> [more phones] [--confirm]');
    console.error('Phone numbers are in the stored format, e.g. +237650035675.');
    process.exit(1);
  }

  console.log(
    confirm
      ? `Deleting ${phones.length} account(s). This cannot be undone.`
      : `DRY RUN over ${phones.length} account(s). Nothing will be deleted.`,
  );

  let deleted = 0;
  for (const phone of phones) {
    if (await processOne(phone, confirm)) deleted += 1;
  }

  console.log(`\n${confirm ? `${deleted} account(s) deleted.` : 'Dry run complete.'}`);
}

main()
  .catch((error) => {
    // A failed transaction rolls back, so a crash leaves the account whole.
    console.error('\nFAILED:', error instanceof Prisma.PrismaClientKnownRequestError ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
