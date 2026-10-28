'use client';

import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';

import { usePermission } from '@/lib/auth/permissions';

/**
 * Page-level permission gate.
 *
 * The layout already hides tabs an operator may not open, but hiding a link is
 * not access control - the address can be typed. This is the second of three
 * checks: the tab is hidden, the page refuses to render, and the API refuses to
 * answer. Only the third actually protects the data; the first two exist so that
 * an operator who lands here by a stale bookmark gets an explanation instead of
 * a page of failed requests.
 */
export function RequirePermission({
  permission,
  what,
  children,
}: {
  permission: string;
  what: string;
  children: ReactNode;
}) {
  const allowed = usePermission(permission);
  if (allowed) return <>{children}</>;

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-hairline py-20 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
        <Lock className="size-5" />
      </span>
      <p className="text-sm font-semibold text-ink">Not your section</p>
      <p className="max-w-sm text-[13px] text-muted-foreground">
        {what} needs the <code className="rounded bg-muted px-1 py-0.5 text-[12px]">{permission}</code>{' '}
        permission, which this account does not hold.
      </p>
    </div>
  );
}
