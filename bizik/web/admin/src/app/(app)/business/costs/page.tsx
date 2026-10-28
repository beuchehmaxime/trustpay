'use client';

import { usePermission } from '@/lib/auth/permissions';
import { CostEditor } from '@/features/analytics/cost-editor';
import { RequirePermission } from '@/features/analytics/guard';
import { Callout } from '@/features/analytics/ui';

/**
 * Operating costs: the one page on which numbers are entered rather than read.
 *
 * Reading is part of the financial grant, because the cost lines are the P&L;
 * writing is its own permission, because a cost edit silently moves the profit
 * figure the business is run on and should not come free with the ability to
 * look at it.
 */
export default function CostsPage() {
  const canEdit = usePermission('analytics.costs');

  return (
    <RequirePermission permission="analytics.financial" what="Operating costs">
      <div className="space-y-6">
        <Callout>
          Nothing in the platform knows what a server, a salary or a lawyer costs, so these are
          entered by hand. EBITDA and margin are computed from them and stay unavailable until a
          month has at least one figure, because a profit number that quietly assumes costs are zero
          would be worse than none.
        </Callout>
        <CostEditor canEdit={canEdit} />
      </div>
    </RequirePermission>
  );
}
