import { KycStatus, Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';

/** Statuses that count as an in-flight submission (block a new one). */
export const ACTIVE_KYC_STATUSES: KycStatus[] = ['SUBMITTED', 'UNDER_REVIEW'];

/** Persistence for KYC records, documents, the review queue and screenings. */
export const KycRepository = {
  // ---- Records ----
  createRecord(data: Prisma.KycRecordUncheckedCreateInput) {
    return prisma.kycRecord.create({ data });
  },

  updateRecord(id: string, data: Prisma.KycRecordUncheckedUpdateInput) {
    return prisma.kycRecord.update({ where: { id }, data });
  },

  getRecordById(id: string) {
    return prisma.kycRecord.findUnique({
      where: { id },
      include: { documents: true, reviewItems: true },
    });
  },

  getLatestForUser(userId: string) {
    return prisma.kycRecord.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { documents: true, reviewItems: true },
    });
  },

  countForUser(userId: string) {
    return prisma.kycRecord.count({ where: { userId } });
  },

  // ---- Documents ----
  addDocuments(
    docs: { kycRecordId: string; type: Prisma.KycDocumentCreateManyInput['type']; fileId: string }[],
  ) {
    return prisma.kycDocument.createMany({ data: docs });
  },

  // ---- Manual review queue ----
  createReviewItem(data: Prisma.ManualReviewItemUncheckedCreateInput) {
    return prisma.manualReviewItem.create({ data });
  },

  resolveReviewItems(kycRecordId: string) {
    return prisma.manualReviewItem.updateMany({
      where: { kycRecordId, resolved: false },
      data: { resolved: true, resolvedAt: new Date() },
    });
  },

  /**
   * KYC records for the admin review list. With a status filter it returns just
   * that status; without one it returns every record (all statuses) so the
   * console's "All statuses" view shows the full history, not only the pending
   * queue. Oldest first (FR-ADM-001 queue order).
   */
  queue(filter: { status?: KycStatus } = {}) {
    return prisma.kycRecord.findMany({
      where: filter.status ? { status: filter.status } : {},
      orderBy: { createdAt: 'asc' },
      include: { documents: true, reviewItems: true },
    });
  },

  // ---- Screenings ----
  recordScreening(data: Prisma.SanctionsScreeningUncheckedCreateInput) {
    return prisma.sanctionsScreening.create({ data });
  },

  // ---- Cross-context user lookups (soft FK; no Prisma relation) ----
  getUsersByIds(ids: string[]) {
    return prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        fullName: true,
        email: true,
        country: true,
        role: true,
        kycTier: true,
      },
    });
  },
};
