import { ContractStatus, Currency, Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';

export interface ProjectListFilter {
  status?: ContractStatus;
  currency?: Currency;
  search?: string;
}

function whereFor(filter: ProjectListFilter): Prisma.ContractWhereInput {
  const search = filter.search?.trim();
  return {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.currency ? { currency: filter.currency } : {}),
    ...(search
      ? {
          OR: [
            { id: { contains: search, mode: 'insensitive' } },
            { title: { contains: search, mode: 'insensitive' } },
            { counterpartyName: { contains: search, mode: 'insensitive' } },
            { counterpartyEmail: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

/** Reads for the admin Projects & contracts oversight module (SRS MOD-05/06). */
export const ProjectsRepository = {
  list(filter: ProjectListFilter, skip: number, take: number) {
    return prisma.contract.findMany({
      where: whereFor(filter),
      orderBy: { createdAt: 'desc' },
      include: { milestones: { orderBy: { order: 'asc' } } },
      skip,
      take,
    });
  },

  count(filter: ProjectListFilter) {
    return prisma.contract.count({ where: whereFor(filter) });
  },

  async statusCounts() {
    const grouped = await prisma.contract.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const counts = {} as Record<ContractStatus, number>;
    for (const row of grouped) counts[row.status] = row._count._all;
    return counts;
  },

  getById(id: string) {
    return prisma.contract.findUnique({
      where: { id },
      include: {
        milestones: {
          orderBy: { order: 'asc' },
          include: { deliverables: true, submissions: true },
        },
        signatures: true,
        amendments: { orderBy: { createdAt: 'desc' } },
        invitations: { orderBy: { createdAt: 'desc' } },
      },
    });
  },

  markCompleted(id: string) {
    return prisma.contract.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  },

  /** Total platform fees collected on a contract (client + freelancer fees). */
  async sumFees(contractId: string) {
    const result = await prisma.feeRecord.aggregate({
      where: { contractId },
      _sum: { amount: true },
    });
    return Number(result._sum.amount ?? 0);
  },

  // ---- Cross-context user lookups (soft FK) ----
  getUsersByIds(ids: string[]) {
    return prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true, email: true, country: true, status: true },
    });
  },

  // ---- Templates ----
  listTemplates() {
    return prisma.contractTemplate.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { milestones: true } } },
    });
  },

  getTemplate(id: string) {
    return prisma.contractTemplate.findUnique({ where: { id } });
  },

  deleteTemplate(id: string) {
    return prisma.contractTemplate.delete({ where: { id } });
  },
};
