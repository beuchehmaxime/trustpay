import type { UserRole } from './types';

/**
 * Roles allowed into the admin console. Mirrors the backend guard
 * `requireRole('ADMIN', 'COMPLIANCE')` (plus super-admin) - see
 * `application/backend/src/admin/admin.routes.ts`.
 */
export const PRIVILEGED_ROLES: readonly string[] = ['admin', 'compliance', 'super_admin'];

export function isPrivileged(role?: UserRole | string | null): boolean {
  return !!role && PRIVILEGED_ROLES.includes(role);
}
