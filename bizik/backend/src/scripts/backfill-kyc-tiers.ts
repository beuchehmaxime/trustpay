/**
 * Bring existing accounts up to the tier they have already earned.
 *
 * The tier ladder - phone proven = Tier 1, documents approved = Tier 2 - is
 * awarded at the moment it is earned. Accounts that earned something BEFORE
 * that was wired up are still carrying the old tier, and nothing would ever
 * move them: you cannot verify a phone number twice.
 *
 * Only ever raises a tier, never lowers one, for the same reason the live code
 * does: a tier is a statement about what somebody has proven, and no backfill
 * should be able to take that away. An account already above the tier its
 * evidence implies is left exactly as it is.
 *
 * Run inside the backend container:
 *   node dist/scripts/backfill-kyc-tiers.js            # dry run
 *   node dist/scripts/backfill-kyc-tiers.js --confirm  # apply
 */
import { PrismaClient } from '@prisma/client';

import { config } from '../config/env';
import { BASIC_TIER } from '../lib/kyc-gate';

const prisma = new PrismaClient();

const STANDARD_TIER = config.kyc.standardTier;

async function main() {
  const confirm = process.argv.includes('--confirm');

  // Approved documents first, so anyone who qualifies for both lands on the
  // higher tier and is not then counted again by the phone pass.
  const approved = await prisma.$queryRaw<{ id: string; fullName: string; kycTier: number }[]>`
    SELECT DISTINCT u."id", u."fullName", u."kycTier"
    FROM "users" u
    JOIN "kyc_records" k ON k."userId" = u."id" AND k."status" = 'APPROVED'
    WHERE u."kycTier" < ${STANDARD_TIER}
    ORDER BY u."id"
  `;

  const phoneProven = await prisma.user.findMany({
    where: { phoneVerified: true, kycTier: { lt: BASIC_TIER } },
    select: { id: true, fullName: true, kycTier: true },
    orderBy: { id: 'asc' },
  });

  // An account in both lists belongs only to the higher one.
  const approvedIds = new Set(approved.map((row) => row.id));
  const phoneOnly = phoneProven.filter((row) => !approvedIds.has(row.id));

  console.log(confirm ? 'Applying tier backfill.' : 'DRY RUN - nothing will be written.');
  console.log(`  ${approved.length} account(s) with approved documents below Tier ${STANDARD_TIER}`);
  console.log(`  ${phoneOnly.length} account(s) with a proven phone below Tier ${BASIC_TIER}`);

  for (const row of [...approved, ...phoneOnly]) {
    const target = approvedIds.has(row.id) ? STANDARD_TIER : BASIC_TIER;
    console.log(`    ${row.id}  ${row.fullName}  tier ${row.kycTier} -> ${target}`);
  }

  if (!confirm) {
    console.log('\nRe-run with --confirm to apply.');
    return;
  }

  // `lt` in the filter makes each write a no-op if something raised the tier
  // between the read above and this write, so a concurrent approval cannot be
  // undone by a backfill that started first.
  const raisedToStandard = approved.length
    ? await prisma.user.updateMany({
        where: { id: { in: approved.map((row) => row.id) }, kycTier: { lt: STANDARD_TIER } },
        data: { kycTier: STANDARD_TIER },
      })
    : { count: 0 };

  const raisedToBasic = phoneOnly.length
    ? await prisma.user.updateMany({
        where: { id: { in: phoneOnly.map((row) => row.id) }, kycTier: { lt: BASIC_TIER } },
        data: { kycTier: BASIC_TIER },
      })
    : { count: 0 };

  console.log(
    `\nRaised ${raisedToStandard.count} to Tier ${STANDARD_TIER} and ${raisedToBasic.count} to Tier ${BASIC_TIER}.`,
  );
}

main()
  .catch((error) => {
    console.error('\nFAILED:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
