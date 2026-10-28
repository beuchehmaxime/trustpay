import crypto from 'crypto';

import { Currency, Prisma, WalletTxType } from '@prisma/client';

import { AppError } from './errors';
import { round2 } from './fees';

type Tx = Prisma.TransactionClient;

/** Human-readable wallet transaction reference, e.g. QTX-20260620-7F3A2B. */
export function newTxReference(): string {
  const d = new Date();
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `QTX-${stamp}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

export interface LedgerResult {
  balanceAfter: number;
  reference: string;
}

interface LedgerEntry {
  userId: string;
  currency: Currency;
  amount: number; // positive magnitude
  type: WalletTxType;
  referenceType?: string;
  referenceId?: string;
  description?: string;
}

/**
 * Ensure a user has a wallet in the given currency, then LOCK that row for the
 * rest of the surrounding transaction (`SELECT … FOR UPDATE`) and return its
 * freshly-read balance. The lock serialises concurrent credits/debits on the
 * same wallet so two simultaneous withdrawals can't both pass the balance check
 * and overdraw (prevents double-spend). Must be called inside a `$transaction`.
 */
async function ensureWallet(tx: Tx, userId: string, currency: Currency) {
  const wallet = await tx.wallet.upsert({
    where: { userId_currency: { userId, currency } },
    update: {},
    create: { userId, currency },
  });
  const lockedRows = await tx.$queryRaw<Array<{ balance: Prisma.Decimal }>>`
    SELECT balance FROM wallets WHERE id = ${wallet.id} FOR UPDATE
  `;
  return { ...wallet, balance: lockedRows[0]?.balance ?? wallet.balance };
}

/**
 * Lock several users' wallets up front, always in the same global order.
 *
 * Whoever locks rows in the order the money flows creates a deadlock the moment
 * two opposite moves run together: A→B holds A and wants B while B→A holds B and
 * wants A, and Postgres kills one of them. Sorting the user ids first means both
 * transactions queue for the same row first, so one simply waits for the other.
 *
 * Call this before the first debit/credit of any move touching more than one
 * wallet. Must run inside a `$transaction`.
 */
export async function lockWalletsInOrder(
  tx: Tx,
  userIds: string[],
  currency: Currency,
): Promise<void> {
  const ordered = [...new Set(userIds)].sort();
  for (const userId of ordered) {
    await ensureWallet(tx, userId, currency);
  }
}

/**
 * The last line of defence for every wallet movement: an amount must be a
 * finite, non-negative number. A negative "credit" silently drains a wallet and
 * a negative "debit" silently fills one - exactly what a mis-set fee rate would
 * have produced on release (FEE_FREELANCER_PCT=10 read as 1000% made the payout
 * -9x the milestone). Refusing here rolls the whole transaction back.
 */
function assertMovableAmount(entry: LedgerEntry, direction: 'credit' | 'debit'): void {
  if (!Number.isFinite(entry.amount) || entry.amount < 0) {
    throw new AppError(
      500,
      'Q-500',
      `Refused a ${direction} of ${entry.amount} ${entry.currency} (${entry.type}): wallet amounts can never be negative.`,
    );
  }
}

/** Credit a wallet inside a transaction; records a signed WalletTransaction. */
export async function creditWallet(tx: Tx, entry: LedgerEntry): Promise<LedgerResult> {
  assertMovableAmount(entry, 'credit');
  const wallet = await ensureWallet(tx, entry.userId, entry.currency);
  // The MOVEMENT is rounded to the currency's precision; the BALANCE is then an
  // exact decimal sum of movements. Doing it the other way - adding in a JS
  // double and rounding the result - lets error accumulate across thousands of
  // transactions, and leaves the stored balance unable to equal the ledger sum
  // exactly, which is the invariant everything below depends on.
  const movement = new Prisma.Decimal(round2(entry.amount));
  const balance = new Prisma.Decimal(wallet.balance).plus(movement);
  const balanceAfter = balance.toNumber();
  const reference = newTxReference();
  await tx.wallet.update({ where: { id: wallet.id }, data: { balance } });
  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      reference,
      type: entry.type,
      amount: movement,
      currency: entry.currency,
      balanceAfter: balance,
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      description: entry.description,
    },
  });
  return { balanceAfter, reference };
}

/** Debit a wallet inside a transaction; throws if the balance is insufficient. */
export async function debitWallet(tx: Tx, entry: LedgerEntry): Promise<LedgerResult> {
  assertMovableAmount(entry, 'debit');
  const wallet = await ensureWallet(tx, entry.userId, entry.currency);
  const movement = new Prisma.Decimal(round2(entry.amount));
  const balance = new Prisma.Decimal(wallet.balance).minus(movement);
  // Compared as a decimal, not as a float. `-0.0000000001 < 0` is true for a
  // double and false for the money it represents; an overdraft check that can
  // be wrong by a rounding error is one that will eventually refuse a
  // legitimate withdrawal of the user's entire balance.
  if (balance.lessThan(0)) {
    throw new AppError(400, 'Q-400', 'Insufficient wallet balance.');
  }
  const balanceAfter = balance.toNumber();
  const reference = newTxReference();
  await tx.wallet.update({ where: { id: wallet.id }, data: { balance } });
  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      reference,
      type: entry.type,
      amount: movement.negated(),
      currency: entry.currency,
      balanceAfter: balance,
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      description: entry.description,
    },
  });
  return { balanceAfter, reference };
}
