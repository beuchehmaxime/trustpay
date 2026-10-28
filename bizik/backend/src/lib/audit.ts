import { prisma } from './prisma';

/**
 * Append an entry to the immutable audit log (SRS FR-ADM-006). Every
 * compliance-sensitive admin action (AML case decisions, account freezes, SAR
 * filings) records who did what, to which entity, and the before/after state.
 *
 * Failures here must never block the action that triggered them, so callers
 * `void` the promise and errors are swallowed with a console warning.
 */
export async function recordAudit(entry: {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  result?: 'SUCCESS' | 'FAILED';
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        result: entry.result ?? 'SUCCESS',
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        beforeState: (entry.before ?? undefined) as object | undefined,
        afterState: (entry.after ?? undefined) as object | undefined,
      },
    });
  } catch (error) {
    console.warn('[audit] failed to record entry', entry.action, error);
  }
}
