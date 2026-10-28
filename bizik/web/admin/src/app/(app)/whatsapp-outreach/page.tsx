'use client';

import { Lock } from 'lucide-react';

import { usePermission } from '@/lib/auth/permissions';
import { Campaigns } from '@/features/whatsapp/campaigns';

/**
 * WhatsApp outreach, on its own page.
 *
 * It used to sit at the bottom of the WhatsApp channel page, under the
 * conversation inbox. That was the wrong shape twice over: the page became too
 * long to scan, and the two things are different jobs held by different people.
 * Reading the channel is support work; messaging thousands of users unprompted
 * is a decision with a cost and a reputational risk attached, which is why it
 * has its own permission rather than riding on `whatsapp.view`.
 *
 * Two permissions, not one. `outreach.view` reads what was sent and to whom;
 * `outreach.send` decides to message thousands of people. A support lead can
 * usefully have the first without the second, the same way they can read the
 * KYC queue without approving anyone.
 *
 * The gate here is a courtesy, not the enforcement - every campaign endpoint
 * checks the same permissions server-side. This just avoids showing an operator
 * a page whose every request would be refused.
 */
export default function WhatsAppOutreachPage() {
  const canView = usePermission('outreach.view');
  const canSend = usePermission('outreach.send');

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-24 text-center">
        <span className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <Lock className="size-6" />
        </span>
        <p className="text-sm font-semibold text-ink">No access</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          You do not have permission to view WhatsApp outreach. An administrator can grant it
          under Roles, in the Communications group.
        </p>
      </div>
    );
  }

  return <Campaigns canSend={canSend} />;
}
