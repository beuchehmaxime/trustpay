import { AmlAlertStatus, AmlAlertType, Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';

/** Alert statuses that still need compliance attention. */
export const OPEN_AML_STATUSES: AmlAlertStatus[] = ['NEW', 'UNDER_REVIEW', 'ESCALATED'];

export interface AmlListFilter {
  status?: AmlAlertStatus;
  type?: AmlAlertType;
}

/** Persistence for AML/sanctions alerts, screenings and SAR reports. */
export const AmlRepository = {
  /** Create an alert - called by the KYC flow on a sanctions/PEP hit. */
  createAlert(data: Prisma.AmlAlertUncheckedCreateInput) {
    return prisma.amlAlert.create({ data });
  },

  list(filter: AmlListFilter = {}) {
    return prisma.amlAlert.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.type ? { type: filter.type } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  getById(id: string) {
    return prisma.amlAlert.findUnique({ where: { id } });
  },

  updateAlert(id: string, data: Prisma.AmlAlertUncheckedUpdateInput) {
    return prisma.amlAlert.update({ where: { id }, data });
  },

  /** Count of alerts grouped by status, for the console KPIs + sidebar badge. */
  async statusCounts() {
    const grouped = await prisma.amlAlert.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const counts: Record<AmlAlertStatus, number> = {
      NEW: 0,
      UNDER_REVIEW: 0,
      CLEARED: 0,
      ESCALATED: 0,
    };
    for (const row of grouped) counts[row.status] = row._count._all;
    return counts;
  },

  /** All sanctions screenings for a user, newest first (case evidence). */
  screeningsForUser(userId: string) {
    return prisma.sanctionsScreening.findMany({
      where: { userId },
      orderBy: { screenedAt: 'desc' },
    });
  },

  createReport(data: Prisma.ReportUncheckedCreateInput) {
    return prisma.report.create({ data });
  },

  /** Audit entries for a case: actions on the alert plus freezes of its user. */
  auditForAlert(alertId: string, userId: string | null) {
    return prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: 'AmlAlert', entityId: alertId },
          ...(userId ? [{ entityType: 'User', entityId: userId }] : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  // ---- Cross-context lookups (soft FK; no Prisma relation) ----
  getUsersByIds(ids: string[]) {
    return prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        fullName: true,
        email: true,
        country: true,
        role: true,
        status: true,
        kycTier: true,
      },
    });
  },
};
