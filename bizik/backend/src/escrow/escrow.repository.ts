import { prisma } from '../lib/prisma';

/** Reads for the escrow domain. Mutations happen inside service transactions. */
export const EscrowRepository = {
  getContract(id: string) {
    return prisma.contract.findUnique({
      where: { id },
      include: { milestones: { orderBy: { order: 'asc' } } },
    });
  },

  getMilestone(id: string) {
    return prisma.milestone.findUnique({
      where: { id },
      include: { contract: { include: { milestones: true } } },
    });
  },

  getAccountByContract(contractId: string) {
    return prisma.escrowAccount.findUnique({ where: { contractId } });
  },

  getAccountWithTransactions(contractId: string) {
    return prisma.escrowAccount.findUnique({
      where: { contractId },
      include: { transactions: { orderBy: { createdAt: 'desc' } }, fees: true },
    });
  },

  /** SUBMITTED milestones whose inspection period has elapsed (auto-release). */
  dueForAutoRelease(now: Date) {
    return prisma.milestone.findMany({
      where: {
        status: 'SUBMITTED',
        autoReleaseAt: { not: null, lte: now },
        contract: { status: { not: 'DISPUTED' } },
      },
      select: { id: true },
    });
  },
};
