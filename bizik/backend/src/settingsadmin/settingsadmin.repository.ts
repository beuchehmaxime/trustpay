import { LegalDocType, Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';

export const SettingsAdminRepository = {
  upsertGroup(key: string, value: Prisma.InputJsonValue, updatedById: string) {
    return prisma.systemSetting.upsert({
      where: { key },
      update: { value, updatedById },
      create: { key, value, updatedById },
    });
  },

  listLegal() {
    return prisma.legalDocument.findMany({ orderBy: { type: 'asc' } });
  },

  getLegal(type: LegalDocType) {
    return prisma.legalDocument.findUnique({ where: { type } });
  },

  updateLegal(
    type: LegalDocType,
    data: {
      title: string;
      content: string;
      version: string;
      published: boolean;
      effectiveAt: Date | null;
      updatedById: string;
    },
  ) {
    return prisma.legalDocument.update({ where: { type }, data });
  },

  actorNames(ids: string[]) {
    return prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true },
    });
  },
};
