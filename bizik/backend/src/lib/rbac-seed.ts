import { PERMISSION_KEYS } from './permissions';
import { prisma } from './prisma';

/**
 * Email bootstrapped as the first super admin, from the environment only.
 *
 * There used to be a hardcoded address here. Signup is phone-first and an email
 * is optional and never verified, so anyone who registered with that address
 * would have been handed full platform admin at the next restart of a fresh or
 * restored database. No default now, and the account must already have a
 * verified email before it is promoted.
 */
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();

/**
 * Idempotent RBAC bootstrap (runs on every boot):
 *  1. Ensure a system "Super Admin" role exists (all permissions).
 *  2. If nobody currently holds it, assign it to SUPER_ADMIN_EMAIL so there is
 *     always a way into the console after a fresh DB.
 */
export async function seedRbac(): Promise<void> {
  let superRole = await prisma.adminRole.findFirst({ where: { isSuperAdmin: true } });
  if (!superRole) {
    superRole = await prisma.adminRole.create({
      data: {
        name: 'Super Admin',
        description: 'Full, unrestricted access to every part of the platform.',
        isSuperAdmin: true,
        isSystem: true,
        permissions: PERMISSION_KEYS,
      },
    });
    console.log('[rbac] created system "Super Admin" role');
  }

  const holders = await prisma.user.count({ where: { adminRoleId: superRole.id } });
  if (holders === 0) {
    if (!SUPER_ADMIN_EMAIL) {
      console.warn('[rbac] no super admin assigned - set SUPER_ADMIN_EMAIL to bootstrap one.');
      return;
    }
    const target = await prisma.user.findUnique({ where: { email: SUPER_ADMIN_EMAIL } });
    // First run on a fresh database has a chicken-and-egg problem: there is no
    // console to verify an email from yet. SUPER_ADMIN_BOOTSTRAP_UNVERIFIED
    // allows exactly that one case, deliberately as an explicit, temporary
    // opt-in rather than the old silent default.
    const allowUnverified = process.env.SUPER_ADMIN_BOOTSTRAP_UNVERIFIED === 'true';
    if (target && !target.emailVerified && !allowUnverified) {
      console.warn(
        `[rbac] refusing to promote ${SUPER_ADMIN_EMAIL}: that account's email is not verified.` +
          ' Verify it, or set SUPER_ADMIN_BOOTSTRAP_UNVERIFIED=true for one boot.',
      );
      return;
    }
    if (target) {
      await prisma.user.update({
        where: { id: target.id },
        data: { adminRoleId: superRole.id, role: 'ADMIN', status: 'ACTIVE' },
      });
      console.log(`[rbac] assigned Super Admin to ${SUPER_ADMIN_EMAIL}`);
    } else {
      console.warn(
        `[rbac] no super admin assigned - user ${SUPER_ADMIN_EMAIL} not found. Set SUPER_ADMIN_EMAIL or assign manually.`,
      );
    }
  }
}
