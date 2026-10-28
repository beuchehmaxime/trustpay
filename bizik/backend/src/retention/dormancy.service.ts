import { DormancyReason, Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { systemSettings } from '../lib/system-settings';

/**
 * Accounts that have been opened and never used, and what happens to them.
 *
 * Two rules, both about accounts that were never anything:
 *
 *  - NEVER_VERIFIED: signed up, never finished identity verification. Deleted
 *    30 days after signup.
 *  - NEVER_ACTIVE: verified phone AND identity, then did nothing whatsoever.
 *    Deleted 90 days after signup.
 *
 * Three things govern the whole of this file, and each exists because the cost
 * of getting it wrong is somebody's account:
 *
 * **Nothing is deleted by a timer.** The schedule only ever finds candidates
 * and warns people. An operator makes the decision, re-enters their password,
 * and the deletion is audited. A cron job that erases accounts on its own is
 * one bad query away from deleting the customers.
 *
 * **An account that has ever touched money is never a candidate**, whatever the
 * rules say. That is enforced again at the moment of deletion rather than only
 * here, because the list an operator approves was computed earlier and the
 * world moves in between.
 *
 * **Nobody is deleted without warning.** Three notices - two weeks out, one
 * week out, and two days out - and an account that has not received all three
 * is not eligible, so a gap in the warning schedule delays the deletion rather
 * than proceeding without notice.
 */

/** Days before deletion that each warning goes out. */
export const NOTICE_SCHEDULE = [14, 7, 2] as const;

export interface DormancyRules {
  /** Days after signup an unverified account is deleted. */
  unverifiedDays: number;
  /** Days after signup a verified-but-unused account is deleted. */
  inactiveDays: number;
}

export function dormancyRules(): DormancyRules {
  const configured = systemSettings().retention;
  return {
    unverifiedDays: Number.isFinite(configured?.dormantUnverifiedDays)
      ? configured.dormantUnverifiedDays
      : 30,
    inactiveDays: Number.isFinite(configured?.dormantInactiveDays)
      ? configured.dormantInactiveDays
      : 90,
  };
}

export interface DormantCandidate {
  userId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  reason: DormancyReason;
  createdAt: Date;
  /** The day this account becomes eligible for deletion. */
  scheduledFor: Date;
  /** How many of the three warnings have gone out. */
  noticesSent: number;
  /** True only when every warning has been sent AND the date has passed. */
  eligible: boolean;
}

/**
 * Every table that means "this person did something".
 *
 * Written out rather than inferred, because this list is the definition of an
 * unused account and a missing entry deletes a real customer. Each is a place a
 * user's own action leaves a row: money moving, a deal they created or were
 * invited to, a payout method they saved, a support ticket they opened, a
 * verification they submitted.
 *
 * Deliberately generous. A false positive here only means an account survives
 * that could have been cleaned up; a false negative deletes somebody who was
 * using the product.
 */
const ACTIVITY_SOURCES: { table: string; column: string }[] = [
  { table: 'wallet_transactions', column: 'walletId' }, // joined via wallets below
  { table: 'contracts', column: 'counterpartyId' },
  { table: 'contracts', column: 'creatorId' },
  { table: 'transfers', column: 'senderId' },
  { table: 'transfers', column: 'recipientId' },
  { table: 'payment_transactions', column: 'userId' },
  { table: 'payout_requests', column: 'userId' },
  { table: 'payout_methods', column: 'userId' },
  { table: 'fx_conversions', column: 'userId' },
  { table: 'support_tickets', column: 'userId' },
  { table: 'kyc_records', column: 'userId' },
  { table: 'messages', column: 'senderId' },
  { table: 'messages', column: 'recipientId' },
  { table: 'disputes', column: 'filedById' },
];

/**
 * SQL that is true for a user who has EVER done anything.
 *
 * One NOT EXISTS per source, so Postgres can stop at the first hit rather than
 * counting rows in every table for every candidate.
 */
function hasNoActivitySql(): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    // Ledger entries hang off the wallet, not the user.
    Prisma.sql`NOT EXISTS (
      SELECT 1 FROM "wallet_transactions" t
      JOIN "wallets" w ON w."id" = t."walletId"
      WHERE w."userId" = u."id"
    )`,
    // A non-zero balance is activity even without a ledger row to prove it.
    Prisma.sql`NOT EXISTS (
      SELECT 1 FROM "wallets" w
      WHERE w."userId" = u."id" AND (w."balance" <> 0 OR w."pendingBalance" <> 0)
    )`,
  ];

  for (const source of ACTIVITY_SOURCES) {
    if (source.table === 'wallet_transactions') continue; // handled above
    clauses.push(
      Prisma.sql`NOT EXISTS (SELECT 1 FROM ${Prisma.raw(`"${source.table}"`)} s WHERE s.${Prisma.raw(`"${source.column}"`)} = u."id")`,
    );
  }

  return Prisma.join(clauses, ' AND ');
}

interface CandidateRow {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  createdAt: Date;
  reason: DormancyReason;
  notices: bigint;
}

/**
 * Accounts currently matching either rule.
 *
 * Returns candidates at every stage - including ones whose date is still weeks
 * away - because the same list drives the warnings and the operator's review.
 * `eligible` is what separates "warn them" from "may be deleted".
 */
export async function findCandidates(): Promise<DormantCandidate[]> {
  const rules = dormancyRules();
  const standardTier = systemSettings().verification.standardTier;
  const noActivity = hasNoActivitySql();

  const rows = await prisma.$queryRaw<CandidateRow[]>`
    SELECT u."id", u."fullName", u."phone", u."email", u."createdAt",
           CASE WHEN u."kycTier" < ${standardTier} THEN 'NEVER_VERIFIED'::"DormancyReason"
                ELSE 'NEVER_ACTIVE'::"DormancyReason" END AS "reason",
           (SELECT COUNT(*) FROM "account_dormancy_notices" n WHERE n."userId" = u."id") AS "notices"
    FROM "users" u
    WHERE
      -- Operators are never dormant accounts; their access is managed by hand.
      u."adminRoleId" IS NULL
      -- ONLY ordinary accounts. FROZEN means an AML or sanctions hold and
      -- SUSPENDED means somebody acted on this account deliberately - deleting
      -- either would destroy the subject of an open investigation, which is the
      -- single worst thing a cleanup job could do. CLOSED is already handled.
      -- Listing the two allowed states rather than excluding the bad ones means
      -- a status added later is excluded by default, not included by accident.
      AND u."status" IN ('PENDING', 'ACTIVE')
      AND (
        -- Rule A: signed up, never verified.
        (u."kycTier" < ${standardTier}
          AND u."createdAt" < NOW() - (${rules.unverifiedDays} || ' days')::interval)
        -- Rule B: fully verified, then nothing at all.
        OR (u."kycTier" >= ${standardTier} AND u."phoneVerified" = true
          AND u."createdAt" < NOW() - (${rules.inactiveDays} || ' days')::interval)
      )
      -- Whatever the rule says, having done ANYTHING keeps the account.
      AND ${noActivity}
    ORDER BY u."createdAt" ASC
  `;

  return rows.map((row) => {
    const days = row.reason === 'NEVER_VERIFIED' ? rules.unverifiedDays : rules.inactiveDays;
    const scheduledFor = new Date(row.createdAt.getTime() + days * 86_400_000);
    const noticesSent = Number(row.notices);
    return {
      userId: row.id,
      fullName: row.fullName,
      phone: row.phone,
      email: row.email,
      reason: row.reason,
      createdAt: row.createdAt,
      scheduledFor,
      noticesSent,
      // Every warning sent AND the day reached. An account that has not had all
      // three notices waits rather than being deleted early - a missed warning
      // should delay a deletion, never excuse one.
      eligible: noticesSent >= NOTICE_SCHEDULE.length && scheduledFor <= new Date(),
    };
  });
}

/** Which warning, if any, is due for this candidate today. */
export function noticeDueFor(candidate: DormantCandidate): number | null {
  const daysLeft = Math.ceil((candidate.scheduledFor.getTime() - Date.now()) / 86_400_000);
  for (let index = 0; index < NOTICE_SCHEDULE.length; index += 1) {
    const stage = index + 1;
    if (candidate.noticesSent >= stage) continue; // already sent
    if (daysLeft <= NOTICE_SCHEDULE[index]) return stage;
    return null; // the next one is not due yet, and stages are in order
  }
  return null;
}
