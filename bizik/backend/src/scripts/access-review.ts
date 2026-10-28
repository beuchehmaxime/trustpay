/**
 * Who can do what, as at today.
 *
 * ISO 27001 A.5.18 requires access rights to be reviewed at planned intervals,
 * and SOC 2 expects evidence that the review happened. Neither is satisfied by
 * the information merely being visible somewhere in an admin console: a review
 * is an act, and an act needs an artefact.
 *
 * This produces that artefact. Run it quarterly, read it, and keep the output.
 * The questions it exists to answer are the ones nobody asks until an auditor
 * does: who still has admin, who has permissions they have never used, and who
 * has not signed in since they left.
 *
 *   node dist/scripts/access-review.js
 *   node dist/scripts/access-review.js --csv > access-review-2026-Q4.csv
 */
import { prisma } from '../lib/prisma';
import { PERMISSIONS } from '../lib/permissions';

/** Accounts quiet for this long are called out - the usual sign of a leaver. */
const DORMANT_DAYS = 90;

interface OperatorRow {
  name: string;
  email: string;
  role: string;
  isSuperAdmin: boolean;
  permissionCount: number | 'all';
  lastLogin: string;
  status: string;
  concern: string;
}

async function collect(): Promise<OperatorRow[]> {
  const operators = await prisma.user.findMany({
    where: {
      OR: [
        { adminRoleId: { not: null } },
        { role: { in: ['ADMIN', 'COMPLIANCE', 'MEDIATOR'] } },
      ],
    },
    select: {
      fullName: true,
      email: true,
      role: true,
      status: true,
      lastLoginAt: true,
      adminRole: { select: { name: true, isSuperAdmin: true, permissions: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const dormantBefore = Date.now() - DORMANT_DAYS * 24 * 60 * 60 * 1000;

  return operators.map((operator) => {
    const role = operator.adminRole;
    const lastLogin = operator.lastLoginAt;

    // Each of these is a reason to look at a row rather than skim past it.
    const concerns: string[] = [];
    if (role?.isSuperAdmin) concerns.push('SUPER ADMIN - can do everything');
    if (!lastLogin) concerns.push('has NEVER signed in');
    else if (lastLogin.getTime() < dormantBefore) concerns.push(`dormant ${DORMANT_DAYS}d+`);
    if (operator.status !== 'ACTIVE') concerns.push(`account ${operator.status}`);
    if (!role && operator.role !== 'CLIENT') {
      // A legacy staff role with no RBAC role attached still carries privileges
      // through the older `STAFF_ROLES` checks, and is easy to miss.
      concerns.push(`legacy ${operator.role} role, no RBAC role assigned`);
    }

    return {
      name: operator.fullName || '(no name)',
      email: operator.email || '(no email)',
      role: role?.name ?? `${operator.role} (legacy)`,
      isSuperAdmin: role?.isSuperAdmin ?? false,
      permissionCount: role?.isSuperAdmin ? 'all' : (role?.permissions.length ?? 0),
      lastLogin: lastLogin ? lastLogin.toISOString().slice(0, 10) : 'never',
      status: operator.status,
      concern: concerns.join('; ') || '-',
    };
  });
}

async function main() {
  const rows = await collect();
  const asCsv = process.argv.includes('--csv');

  if (asCsv) {
    console.log('name,email,role,super_admin,permissions,last_login,status,concern');
    for (const row of rows) {
      const cells = [
        row.name,
        row.email,
        row.role,
        row.isSuperAdmin ? 'yes' : 'no',
        String(row.permissionCount),
        row.lastLogin,
        row.status,
        row.concern,
      ];
      // Quote everything: names and concerns both contain commas.
      console.log(cells.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','));
    }
    return;
  }

  console.log(`\nAccess review - ${new Date().toISOString().slice(0, 10)}`);
  console.log(`${rows.length} account(s) with platform access\n`);

  for (const row of rows) {
    console.log(`  ${row.name} <${row.email}>`);
    console.log(
      `    role=${row.role}  permissions=${row.permissionCount}  last login=${row.lastLogin}  status=${row.status}`,
    );
    if (row.concern !== '-') console.log(`    ⚠ ${row.concern}`);
    console.log('');
  }

  const superAdmins = rows.filter((row) => row.isSuperAdmin).length;
  const dormant = rows.filter((row) => row.concern.includes('dormant') || row.concern.includes('NEVER')).length;

  console.log('--- summary ---');
  console.log(`  super admins        : ${superAdmins}`);
  console.log(`  dormant or unused   : ${dormant}`);
  console.log(`  permissions defined : ${PERMISSIONS.length}`);
  console.log(
    '\nFor each row above, decide: does this person still need this access?\n' +
      'Remove what is not needed, then keep this output as the evidence that the\n' +
      'review happened. An access review nobody recorded did not happen.\n',
  );
}

main()
  .catch((error) => {
    console.error('[access-review] failed:', (error as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
