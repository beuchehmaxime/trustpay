'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { usePermission } from '@/lib/auth/permissions';

/**
 * Placeholder for a platform module that isn't built yet. Enforces the module's
 * view permission so a deep link can't reveal a section the operator can't see.
 */
export function ModuleStub({
  title,
  description,
  icon,
  permission,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  permission: string;
}) {
  const allowed = usePermission(permission);

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-24 text-center">
        <span className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <Lock className="size-6" />
        </span>
        <p className="text-sm font-semibold text-ink">No access</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          You don’t have permission to view this section. Ask a super admin to add
          it to your role.
        </p>
        <Button variant="outline" size="sm" render={<Link href="/dashboard" />}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-24 text-center">
        <span className="flex size-12 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          {icon}
        </span>
        <p className="text-sm font-semibold text-ink">Coming soon</p>
        <p className="max-w-md text-xs text-muted-foreground">
          This module is on the roadmap. Navigation and access control are already
          wired - the screens land here next.
        </p>
      </div>
    </div>
  );
}
