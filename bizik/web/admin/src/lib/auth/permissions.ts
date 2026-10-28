import { useAuthStore } from './auth.store';
import type { AuthUser } from './types';

/** Whether a user holds a permission. Super admins (`['*']`) hold everything. */
export function hasPermission(user: AuthUser | null, perm: string): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  const perms = user.permissions ?? [];
  return perms.includes('*') || perms.includes(perm);
}

/** Reactive hook: does the signed-in operator hold `perm`? */
export function usePermission(perm: string): boolean {
  return useAuthStore((state) => hasPermission(state.user, perm));
}

/** Reactive hook: is the signed-in user a super admin? */
export function useIsSuperAdmin(): boolean {
  return useAuthStore((state) => !!state.user?.isSuperAdmin);
}
