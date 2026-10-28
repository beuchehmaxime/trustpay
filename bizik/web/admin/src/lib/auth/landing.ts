import { hasPermission } from './permissions';
import type { AuthUser } from './types';

/**
 * The admin navigation in sidebar order, each paired with the permission that
 * unlocks it (null = available to every operator, e.g. the notification inbox).
 * Kept in sync with the sidebar in `components/app-shell.tsx`.
 */
export const NAV_ORDER: { href: string; perm: string | string[] | null }[] = [
  { href: '/dashboard', perm: 'dashboard.view' },
  { href: '/users', perm: 'users.view' },
  { href: '/kyc', perm: 'kyc.view' },
  { href: '/aml', perm: 'aml.view' },
  { href: '/disputes', perm: 'disputes.view' },
  { href: '/audit', perm: 'audit.view' },
  { href: '/whatsapp', perm: 'whatsapp.view' },
  { href: '/whatsapp-outreach', perm: 'outreach.view' },
  { href: '/contracts', perm: 'contracts.view' },
  { href: '/escrow', perm: 'escrow.view' },
  { href: '/wallets', perm: 'wallets.view' },
  { href: '/fees', perm: 'fees.view' },
  { href: '/notifications', perm: null },
  { href: '/reports', perm: 'reports.view' },
  { href: '/business', perm: ['analytics.product', 'analytics.financial'] },
  { href: '/roles', perm: 'roles.view' },
  { href: '/operators', perm: 'operators.view' },
  { href: '/settings', perm: 'settings.view' },
  { href: '/support', perm: 'support.view' },
  { href: '/blog', perm: 'support.view' },
];

/**
 * The route to land an operator on after login (and the redirect target when
 * they hit a page they lack permission for). Prefers the first section they
 * were explicitly granted - so an operator with only `support.view` lands on
 * `/support`, not the dashboard. Always-available items (the notification
 * inbox) are only used as a last-resort fallback.
 */
export function firstAccessibleRoute(user: AuthUser | null): string {
  for (const entry of NAV_ORDER) {
    if (!entry.perm) continue;
    // An array is "any of": a section assembled from several independently
    // granted parts is reachable as soon as the operator holds one of them.
    const required = Array.isArray(entry.perm) ? entry.perm : [entry.perm];
    if (required.some((permission) => hasPermission(user, permission))) return entry.href;
  }
  return '/notifications';
}
