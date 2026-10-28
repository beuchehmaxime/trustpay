import { Prisma } from '@prisma/client';

import { captureError } from './observability';
import { prisma } from './prisma';

/**
 * Prove that every stored wallet balance equals the sum of its ledger.
 *
 * The platform stores a balance AND writes a transaction row for every
 * movement. That is the right structure, but until this existed the two were
 * never compared - so the ledger was a write-only log that could not be used to
 * repair anything, and the stored balance was trusted absolutely with nothing
 * checking it.
 *
 * The rule this enforces is the one that makes a ledger a ledger:
 *
 *     wallets.balance === SUM(wallet_transactions.amount) for that wallet
 *
 * The ledger is the source of truth. The stored balance is a cache of it, kept
 * because deriving a balance with an aggregate on every read does not survive
 * growth. A cache nobody validates is not a cache, it is a second opinion - and
 * for money, two opinions that disagree silently is the whole problem.
 *
 * Drift here is never cosmetic. It means either a balance changed without a
 * ledger row (money appeared), a ledger row exists without a balance change
 * (money vanished), or something wrote a balance directly. All three are
 * incidents, which is why this raises a CRITICAL alert rather than a log line.
 */

export interface WalletDrift {
  walletId: string;
  userId: string;
  currency: string;
  /** What the wallet row says. */
  stored: string;
  /** What the ledger adds up to. */
  derived: string;
  /** stored - derived. Positive means the wallet claims money the ledger cannot account for. */
  difference: string;
  transactionCount: number;
}

export interface ReconciliationResult {
  walletsChecked: number;
  drifted: WalletDrift[];
  /** Total absolute drift, as a string so no float ever touches it. */
  totalDrift: string;
}

/**
 * Compare every wallet against its ledger.
 *
 * Done in SQL rather than by loading rows into memory: the comparison has to be
 * exact, and exactness is the one thing a JavaScript number cannot promise about
 * money. Postgres sums the `numeric` column at full precision and the difference
 * comes back already decided.
 */
export async function reconcileWallets(): Promise<ReconciliationResult> {
  const rows = await prisma.$queryRaw<
    {
      walletId: string;
      userId: string;
      currency: string;
      stored: Prisma.Decimal;
      derived: Prisma.Decimal;
      difference: Prisma.Decimal;
      txCount: bigint;
    }[]
  >`
    SELECT
      w."id"                                   AS "walletId",
      w."userId"                               AS "userId",
      w."currency"::text                       AS "currency",
      w."balance"                              AS "stored",
      COALESCE(SUM(t."amount"), 0)             AS "derived",
      w."balance" - COALESCE(SUM(t."amount"), 0) AS "difference",
      COUNT(t."id")                            AS "txCount"
    FROM wallets w
    LEFT JOIN wallet_transactions t ON t."walletId" = w."id"
    GROUP BY w."id", w."userId", w."currency", w."balance"
    HAVING w."balance" <> COALESCE(SUM(t."amount"), 0)
  `;

  const [{ total }] = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*)::bigint AS total FROM wallets
  `;

  const drifted: WalletDrift[] = rows.map((row) => ({
    walletId: row.walletId,
    userId: row.userId,
    currency: row.currency,
    stored: row.stored.toString(),
    derived: row.derived.toString(),
    difference: row.difference.toString(),
    transactionCount: Number(row.txCount),
  }));

  const totalDrift = drifted
    .reduce((sum, entry) => sum.plus(new Prisma.Decimal(entry.difference).abs()), new Prisma.Decimal(0))
    .toString();

  return { walletsChecked: Number(total), drifted, totalDrift };
}

/**
 * Reconcile, and make noise if anything is wrong.
 *
 * Deliberately does NOT attempt a repair. Which number is right depends on what
 * went wrong: if a balance was written without a ledger row, the ledger is
 * right; if a ledger row was written twice, it is not. Automatically "fixing" a
 * balance would destroy the evidence of how it broke and could move real money
 * in the wrong direction. A person decides, with the drift report in front of
 * them.
 */
export async function reconcileAndAlert(): Promise<ReconciliationResult> {
  const result = await reconcileWallets();
  if (!result.drifted.length) return result;

  const summary = result.drifted
    .slice(0, 5)
    .map(
      (entry) =>
        `${entry.currency} wallet ${entry.walletId.slice(0, 8)}: stored ${entry.stored}, ` +
        `ledger ${entry.derived}, off by ${entry.difference}`,
    )
    .join(' | ');

  captureError(
    new Error(
      `${result.drifted.length} wallet(s) disagree with their ledger (total drift ${result.totalDrift}). ${summary}`,
    ),
    {
      scope: 'ledger.reconciliation',
      severity: 'critical',
      extra: {
        walletsChecked: result.walletsChecked,
        driftedCount: result.drifted.length,
        totalDrift: result.totalDrift,
      },
    },
  );

  return result;
}

/**
 * Rebuild one wallet's balance from its ledger.
 *
 * The repair, run by a person once they have decided the ledger is the correct
 * side - which is the usual outcome, since the ledger is append-only and the
 * balance is not. Kept separate from the check on purpose: detection must never
 * quietly become correction.
 */
export async function rebuildWalletFromLedger(walletId: string): Promise<{
  before: string;
  after: string;
}> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ balance: Prisma.Decimal }[]>`
      SELECT balance FROM wallets WHERE id = ${walletId} FOR UPDATE
    `;
    if (!locked.length) throw new Error(`wallet ${walletId} not found`);

    const [{ derived }] = await tx.$queryRaw<{ derived: Prisma.Decimal }[]>`
      SELECT COALESCE(SUM(amount), 0) AS derived
      FROM wallet_transactions WHERE "walletId" = ${walletId}
    `;

    await tx.wallet.update({ where: { id: walletId }, data: { balance: derived } });
    return { before: locked[0].balance.toString(), after: derived.toString() };
  });
}
