'use client';

import type { NavBadge } from '@/components/shell/nav';
import { useContractsQuery } from './use-deals';
import { useDisputes } from './use-disputes';
import { useUnreadCount } from './use-notifications';

/**
 * Live counts for the desktop sidebar badges:
 *  - `dealsAction`  → deals you were invited to but haven't accepted yet.
 *  - `openDisputes` → disputes awaiting YOUR reply (filed against you, still
 *    in a response state).
 *  - `unread`       → unread notifications.
 */
export function useNavBadgeCounts(): Record<NavBadge, number> {
  const contractsQuery = useContractsQuery();
  const disputesQuery = useDisputes();
  const unreadCount = useUnreadCount().data ?? 0;

  const pendingInvites = (contractsQuery.data?.invited ?? []).filter(
    (contract) => !contract.accepted && contract.rawStatus !== 'CANCELLED',
  ).length;

  const disputesAwaitingReply = (disputesQuery.data ?? []).filter(
    (dispute) =>
      !dispute.filedByYou &&
      (dispute.status === 'FILED' || dispute.status === 'AWAITING_RESPONSE'),
  ).length;

  return {
    dealsAction: pendingInvites,
    openDisputes: disputesAwaitingReply,
    unread: unreadCount,
  };
}
