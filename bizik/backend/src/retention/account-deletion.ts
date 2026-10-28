import { prisma } from '../lib/prisma';

/**
 * Deleting a user account, and refusing to.
 *
 * Shared by the operator-facing dormant-account purge and the
 * delete-account.js script, so the two cannot drift. A guard that exists in one
 * path and not the other is the same as no guard: whoever is in a hurry uses
 * the one without it.
 */

/**
 * Tables that must be EMPTY for an account to be deletable, with the plain
 * sentence shown when they are not.
 *
 * In a regulated product these rows ARE the audit trail. Deleting the person
 * they belong to leaves money and obligations nobody can account for, which is
 * a far worse outcome than keeping a dead account. If one genuinely has to go,
 * that is a data-retention decision with a legal answer, not a cleanup job.
 */
const BLOCKING_CHECKS: { table: string; column: string; reason: string }[] = [
  { table: 'contracts', column: 'counterpartyId', reason: 'deals as counterparty' },
  { table: 'contracts', column: 'creatorId', reason: 'deals they created' },
  { table: 'payout_requests', column: 'userId', reason: 'payout requests' },
  { table: 'payment_transactions', column: 'userId', reason: 'payment transactions' },
  { table: 'fx_conversions', column: 'userId', reason: 'currency conversions' },
  { table: 'fee_records', column: 'payerId', reason: 'fees charged' },
  { table: 'payment_intents', column: 'payerId', reason: 'payment intents' },
  { table: 'aml_alerts', column: 'userId', reason: 'AML alerts' },
  { table: 'transfers', column: 'senderId', reason: 'money sent' },
  { table: 'transfers', column: 'recipientId', reason: 'money received' },
];

/**
 * Tables cleared when an account is deleted, in dependency order.
 *
 * Listed explicitly rather than discovered by scanning for a `userId` column,
 * so a table added next year does not quietly join the delete set.
 */
const DELETE_IN_ORDER: { table: string; column: string }[] = [
  { table: 'account_dormancy_notices', column: 'userId' },
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
  // Table and column names come from the constants above, never from input.
  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*) AS "count" FROM "${table}" WHERE "${column}" = $1`,
    userId,
  );
  return Number(rows[0]?.count ?? 0);
}

/**
 * Why this account must not be deleted, or null if it may be.
 *
 * Re-run at the moment of deletion, not only when the candidate list was built.
 * An operator reviews a list computed minutes or hours earlier, and in between
 * the person may have funded a deal - deleting them then would destroy a live
 * obligation.
 */
export async function deletionBlockers(userId: string): Promise<string[]> {
  const blockers: string[] = [];

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { adminRoleId: true },
  });
  if (!user) return ['the account no longer exists'];
  if (user.adminRoleId) {
    blockers.push('this is a platform operator account');
  }

  const fundedWallets = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) AS "count" FROM "wallets"
    WHERE "userId" = ${userId} AND ("balance" <> 0 OR "pendingBalance" <> 0)
  `;
  if (Number(fundedWallets[0]?.count ?? 0) > 0) {
    blockers.push('a wallet still holds a balance');
  }

  const ledger = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) AS "count"
    FROM "wallet_transactions" t
    JOIN "wallets" w ON w."id" = t."walletId"
    WHERE w."userId" = ${userId}
  `;
  const ledgerCount = Number(ledger[0]?.count ?? 0);
  if (ledgerCount > 0) blockers.push(`${ledgerCount} ledger entries`);

  for (const check of BLOCKING_CHECKS) {
    const count = await countRows(check.table, check.column, userId);
    if (count > 0) blockers.push(`${count} ${check.reason}`);
  }

  return blockers;
}

export interface DeletionResult {
  userId: string;
  deleted: boolean;
  blockers: string[];
}

/**
 * Delete one account, or refuse and say why.
 *
 * Everything happens in a single transaction, so a failure part-way leaves the
 * account whole rather than in pieces. Audit log rows are never touched: they
 * record what OPERATORS did, and a trail that can be erased by deleting its
 * subject is not a trail.
 */
export async function deleteAccount(userId: string): Promise<DeletionResult> {
  const blockers = await deletionBlockers(userId);
  if (blockers.length > 0) return { userId, deleted: false, blockers };

  await prisma.$transaction(async (tx) => {
    for (const target of DELETE_IN_ORDER) {
      await tx.$executeRawUnsafe(
        `DELETE FROM "${target.table}" WHERE "${target.column}" = $1`,
        userId,
      );
    }
    await tx.$executeRaw`DELETE FROM "users" WHERE "id" = ${userId}`;
  });

  return { userId, deleted: true, blockers: [] };
}
