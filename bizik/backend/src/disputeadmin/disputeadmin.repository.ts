import { DisputeStatus } from '@prisma/client';

import { prisma } from '../lib/prisma';

/** Dispute statuses still needing attention. */
export const OPEN_DISPUTE_STATUSES: DisputeStatus[] = [
  'FILED',
  'AWAITING_RESPONSE',
  'UNDER_REVIEW',
  'ESCALATED',
];

export interface DisputeListFilter {
  status?: DisputeStatus;
}

/** Reads/writes for the admin Disputes console (SRS MOD-11). */
export const DisputeAdminRepository = {
  list(filter: DisputeListFilter, skip: number, take: number) {
    return prisma.dispute.findMany({
      where: filter.status ? { status: filter.status } : {},
      orderBy: { createdAt: 'desc' },
      include: { assignments: { where: { recusedAt: null }, orderBy: { assignedAt: 'desc' } } },
      skip,
      take,
    });
  },

  count(filter: DisputeListFilter) {
    return prisma.dispute.count({ where: filter.status ? { status: filter.status } : {} });
  },

  statusCounts() {
    return prisma.dispute.groupBy({ by: ['status'], _count: { _all: true } });
  },

  /** Full dispute for the admin detail view. */
  getFull(id: string) {
    return prisma.dispute.findUnique({
      where: { id },
      include: {
        evidence: { orderBy: { createdAt: 'asc' } },
        responses: { orderBy: { createdAt: 'asc' } },
        messages: { orderBy: { createdAt: 'asc' } },
        timeline: { orderBy: { createdAt: 'asc' } },
        assignments: { orderBy: { assignedAt: 'desc' } },
        ruling: true,
        aiRec: true,
      },
    });
  },

  getContract(contractId: string) {
    return prisma.contract.findUnique({ where: { id: contractId }, include: { milestones: true } });
  },

  getAccount(contractId: string) {
    return prisma.escrowAccount.findUnique({ where: { contractId } });
  },

  createAssignment(disputeId: string, mediatorId: string) {
    return prisma.mediatorAssignment.create({ data: { disputeId, mediatorId } });
  },

  addMessage(disputeId: string, senderId: string, body: string) {
    return prisma.disputeMessage.create({ data: { disputeId, senderId, body } });
  },

  addTimeline(disputeId: string, event: string, actorId?: string) {
    return prisma.disputeTimelineEvent.create({ data: { disputeId, event, actorId } });
  },

  setStatus(id: string, status: DisputeStatus) {
    return prisma.dispute.update({ where: { id }, data: { status } });
  },

  /** Operators eligible to mediate (any platform staff member). */
  listMediators() {
    return prisma.user.findMany({
      where: { adminRoleId: { not: null } },
      select: { id: true, fullName: true, email: true, adminRole: { select: { name: true } } },
      orderBy: { fullName: 'asc' },
    });
  },

  getUsersByIds(ids: string[]) {
    return prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true, email: true },
    });
  },
};
