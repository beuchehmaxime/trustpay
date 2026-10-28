import crypto from 'crypto';

import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';

function newProjectId(): string {
  const d = new Date();
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `QTQ-${stamp}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

export const ContractRepository = {
  findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, fullName: true, country: true },
    });
  },

  findUserByPhone(phone: string) {
    return prisma.user.findUnique({
      where: { phone },
      select: { id: true, fullName: true, country: true },
    });
  },

  createProject(data: {
    creatorId: string;
    counterpartyId: string | null;
    counterpartyName: string | null;
    counterpartyEmail: string | null;
    counterpartyPhone: string | null;
    creatorIsPayer: boolean;
    currency: Prisma.ContractCreateInput['currency'];
    totalAmount: number;
    inspectionDays: number;
    description?: string;
    milestones: {
      title: string;
      description?: string;
      amount: number;
      dueDate?: string;
      currency: Prisma.ContractCreateInput['currency'];
    }[];
    title: string;
  }) {
    return prisma.contract.create({
      data: {
        id: newProjectId(),
        title: data.title,
        description: data.description,
        creatorId: data.creatorId,
        counterpartyId: data.counterpartyId,
        counterpartyName: data.counterpartyName,
        counterpartyEmail: data.counterpartyEmail ? data.counterpartyEmail.toLowerCase() : null,
        counterpartyPhone: data.counterpartyPhone,
        creatorIsPayer: data.creatorIsPayer,
        currency: data.currency,
        totalAmount: data.totalAmount,
        inspectionDays: data.inspectionDays,
        status: 'INVITED',
        milestones: {
          create: data.milestones.map((m, i) => ({
            order: i,
            title: m.title,
            description: m.description,
            amount: m.amount,
            currency: data.currency,
            status: 'PENDING',
            deadline: m.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(m.dueDate) ? new Date(m.dueDate) : null,
          })),
        },
      },
      include: { milestones: { orderBy: { order: 'asc' } } },
    });
  },

  /** Projects the user created (mine) or was invited to (by id, email or phone). */
  getForUser(userId: string, email: string, phone?: string | null) {
    const or: Prisma.ContractWhereInput[] = [
      { creatorId: userId },
      { counterpartyId: userId },
    ];
    if (email) or.push({ counterpartyEmail: email.toLowerCase() });
    if (phone) or.push({ counterpartyPhone: phone });
    return prisma.contract.findMany({
      where: { OR: or },
      include: { milestones: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  },

  submissionsForMilestones(milestoneIds: string[]) {
    return prisma.milestoneSubmission.findMany({
      where: { milestoneId: { in: milestoneIds } },
      orderBy: { createdAt: 'asc' },
      select: { milestoneId: true, fileIds: true, note: true },
    });
  },

  getById(id: string) {
    return prisma.contract.findUnique({
      where: { id },
      include: { milestones: { orderBy: { order: 'asc' } } },
    });
  },

  accept(id: string, counterpartyId: string) {
    return prisma.contract.update({
      where: { id },
      data: {
        accepted: true,
        acceptedAt: new Date(),
        counterpartyId,
        status: 'SIGNED',
      },
      include: { milestones: { orderBy: { order: 'asc' } } },
    });
  },

  /** Invitee declines the invitation → the (never-funded) project is cancelled. */
  decline(id: string) {
    return prisma.contract.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
      include: { milestones: { orderBy: { order: 'asc' } } },
    });
  },

  /** The creator cancels their own (never-funded) deal. */
  cancel(id: string, reason?: string) {
    return prisma.contract.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: reason ?? 'CANCELLED_BY_CREATOR',
      },
      include: { milestones: { orderBy: { order: 'asc' } } },
    });
  },

  updateCounterparty(
    id: string,
    data: {
      counterpartyName: string | null;
      counterpartyEmail: string | null;
      counterpartyPhone: string | null;
      counterpartyId: string | null;
    },
  ) {
    return prisma.contract.update({
      where: { id },
      data,
      include: { milestones: { orderBy: { order: 'asc' } } },
    });
  },

  getUsersByIds(ids: string[]) {
    return prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true, country: true },
    });
  },
};
