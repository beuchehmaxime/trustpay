import { DisputeStatus, Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';

/** Persistence for the dispute domain. */
export const DisputeRepository = {
  getById(id: string) {
    return prisma.dispute.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        evidence: true,
        ruling: true,
        timeline: { orderBy: { createdAt: 'asc' } },
      },
    });
  },

  /** Disputes on any of the given contracts (the user's projects). */
  listForContracts(contractIds: string[]) {
    return prisma.dispute.findMany({
      where: { contractId: { in: contractIds } },
      orderBy: { createdAt: 'desc' },
    });
  },

  /** Contract ids where the user is a party (creator / counterparty / invitee). */
  contractsForUser(userId: string, email: string) {
    return prisma.contract.findMany({
      where: {
        OR: [{ creatorId: userId }, { counterpartyId: userId }, { counterpartyEmail: email.toLowerCase() }],
      },
      include: { milestones: true },
    });
  },

  getContract(id: string) {
    return prisma.contract.findUnique({ where: { id }, include: { milestones: true } });
  },

  getMilestone(id: string) {
    return prisma.milestone.findUnique({ where: { id } });
  },

  getAccount(contractId: string) {
    return prisma.escrowAccount.findUnique({ where: { contractId } });
  },

  addMessage(disputeId: string, senderId: string, body: string) {
    return prisma.disputeMessage.create({ data: { disputeId, senderId, body } });
  },

  addEvidence(disputeId: string, submittedById: string, fileIds: string[], description?: string) {
    return prisma.disputeEvidence.create({
      data: { disputeId, submittedById, fileIds, description },
    });
  },

  addTimeline(disputeId: string, event: string, actorId?: string) {
    return prisma.disputeTimelineEvent.create({ data: { disputeId, event, actorId } });
  },

  setStatus(id: string, status: DisputeStatus, resolvedAt?: Date) {
    return prisma.dispute.update({ where: { id }, data: { status, resolvedAt } });
  },

  createRuling(data: Prisma.DisputeRulingUncheckedCreateInput) {
    return prisma.disputeRuling.create({ data });
  },

  getUsersByIds(ids: string[]) {
    return prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true, email: true },
    });
  },
};
