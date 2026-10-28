import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { systemSettings } from '../lib/system-settings';

/**
 * Who an outreach campaign goes to.
 *
 * Every segment answers a question an operator actually asks: "who signed up
 * and never verified?", "who verified and never did a deal?", "who has been
 * quiet for a month?". Each one is a single SQL statement rather than a filter
 * built in JavaScript over every user, because the interesting segments are all
 * ABSENCES ("no deal", "no money moved") and an absence is what a relational
 * database answers well - `NOT EXISTS` stays fast as the table grows, while
 * "fetch every user and filter in memory" quietly stops working.
 *
 * Two rules hold for all of them:
 *  - a phone number is required (it is the WhatsApp address), and
 *  - accounts that cannot act - suspended, frozen, closed - are never included.
 *    Nudging somebody to finish KYC while Compliance has their account frozen is
 *    the wrong message at the worst moment.
 *
 * The user's own opt-out is NOT applied here. It is applied at send time and
 * recorded per recipient, so the audience count an operator approved is the
 * same number the report adds up to.
 */

export interface SegmentMember {
  id: string;
  phone: string;
  fullName: string | null;
  locale: string | null;
}

export interface SegmentDefinition {
  key: string;
  label: string;
  /** What an operator would want to say to these people, in one line. */
  description: string;
  /** Rows for this segment, newest signups first. */
  members(limit?: number): Promise<SegmentMember[]>;
  count(): Promise<number>;
}

/** Statuses an account can be in and still be worth messaging. */
const REACHABLE_STATUS = Prisma.sql`u."status"::text IN ('ACTIVE', 'PENDING')`;

/**
 * Shared preamble: a reachable account with a WhatsApp-capable address, and not
 * platform staff. Staff are excluded by role AND by having an admin-console
 * role assigned, because the unified account model means an operator's own
 * account is an ordinary user account in every other respect - it would
 * otherwise turn up in "never did a deal" and get its own marketing.
 */
const REACHABLE = Prisma.sql`
  u."phone" IS NOT NULL AND u."phone" <> ''
  AND ${REACHABLE_STATUS}
  AND u."adminRoleId" IS NULL
  AND u."role"::text NOT IN ('ADMIN', 'COMPLIANCE', 'MEDIATOR')`;

/** Nobody is a party to a deal - as creator, as matched counterparty, or by the
 *  number a deal was invited to before they had an account. */
const NO_DEAL = Prisma.sql`NOT EXISTS (
  SELECT 1 FROM contracts contract
  WHERE contract."creatorId" = u."id"
     OR contract."counterpartyId" = u."id"
     OR contract."counterpartyPhone" = u."phone"
)`;

/** No money has ever moved for this account: no transfer either way, and no
 *  wallet movement (deposit, withdrawal, escrow, conversion). */
const NO_MONEY_MOVED = Prisma.sql`NOT EXISTS (
  SELECT 1 FROM transfers transfer
  WHERE transfer."senderId" = u."id" OR transfer."recipientId" = u."id"
) AND NOT EXISTS (
  SELECT 1 FROM wallet_transactions movement
  JOIN wallets wallet ON wallet."id" = movement."walletId"
  WHERE wallet."userId" = u."id"
)`;

/**
 * Run one segment's WHERE clause, either as a count or as a page of rows.
 * Kept in one place so a segment cannot accidentally count a different
 * population from the one it messages.
 */
function segment(
  key: string,
  label: string,
  description: string,
  where: Prisma.Sql,
): SegmentDefinition {
  return {
    key,
    label,
    description,
    async count() {
      const rows = await prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*)::bigint AS total FROM users u WHERE ${REACHABLE} AND ${where}
      `;
      return Number(rows[0]?.total ?? 0);
    },
    async members(limit = 5000) {
      return prisma.$queryRaw<SegmentMember[]>`
        SELECT u."id", u."phone", u."fullName", u."locale"
        FROM users u
        WHERE ${REACHABLE} AND ${where}
        ORDER BY u."createdAt" DESC
        LIMIT ${limit}
      `;
    },
  };
}

/**
 * The catalogue. Built per call rather than once at import, because the
 * "verified" tier is an operator setting that can change while the server runs -
 * a segment cached at boot would keep using the old bar.
 */
export function campaignSegments(): SegmentDefinition[] {
  const verifiedTier = systemSettings().verification.standardTier;

  return [
    segment(
      'unverified',
      'Signed up, not verified',
      'Created an account but has not cleared KYC. The nudge that unlocks everything else.',
      Prisma.sql`u."kycTier" < ${verifiedTier}`,
    ),
    segment(
      'kyc_in_review',
      'KYC submitted, awaiting review',
      'Waiting on us, not on them. Worth telling them it is in hand.',
      Prisma.sql`u."kycTier" < ${verifiedTier} AND EXISTS (
        SELECT 1 FROM kyc_records record
        WHERE record."userId" = u."id" AND record."status"::text IN ('SUBMITTED', 'UNDER_REVIEW')
      )`,
    ),
    segment(
      'kyc_rejected',
      'KYC rejected',
      'Their documents were refused; most give up rather than retry. Say what to fix.',
      Prisma.sql`u."kycTier" < ${verifiedTier} AND EXISTS (
        SELECT 1 FROM kyc_records record
        WHERE record."userId" = u."id" AND record."status"::text = 'REJECTED'
      )`,
    ),
    segment(
      'never_started_kyc',
      'Never opened KYC',
      'No verification attempt at all - the widest top-of-funnel group.',
      Prisma.sql`u."kycTier" < ${verifiedTier} AND NOT EXISTS (
        SELECT 1 FROM kyc_records record WHERE record."userId" = u."id"
      )`,
    ),
    segment(
      'verified_no_deal',
      'Verified, no deal yet',
      'Did the hard part and stopped. The highest-intent group on the platform.',
      Prisma.sql`u."kycTier" >= ${verifiedTier} AND ${NO_DEAL}`,
    ),
    segment(
      'no_deal',
      'No deal yet (any tier)',
      'Everyone who has never been party to a deal, verified or not.',
      NO_DEAL,
    ),
    segment(
      'no_money_moved',
      'No money moved yet',
      'No transfer and no wallet movement - never sent, received or withdrawn.',
      NO_MONEY_MOVED,
    ),
    segment(
      'no_payout_method',
      'No withdrawal number saved',
      'Cannot be paid out yet. Blocks them the moment they earn something.',
      Prisma.sql`NOT EXISTS (
        SELECT 1 FROM payout_methods method
        WHERE method."userId" = u."id" AND method."deletedAt" IS NULL
      )`,
    ),
    segment(
      'dormant_30d',
      'Quiet for 30 days',
      'Has not signed in for a month (or never has since signing up).',
      Prisma.sql`COALESCE(u."lastLoginAt", u."createdAt") < NOW() - INTERVAL '30 days'`,
    ),
    segment(
      'new_7d',
      'Joined in the last 7 days',
      'Fresh signups, while the app is still on their mind.',
      Prisma.sql`u."createdAt" >= NOW() - INTERVAL '7 days'`,
    ),
    segment(
      'all_users',
      'Every reachable user',
      'All active accounts with a phone number. Use sparingly.',
      Prisma.sql`TRUE`,
    ),
  ];
}

export function findSegment(key: string): SegmentDefinition | undefined {
  return campaignSegments().find((definition) => definition.key === key);
}
