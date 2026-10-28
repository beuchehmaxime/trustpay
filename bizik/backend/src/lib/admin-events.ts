import { AdminEventSeverity, AdminEventType } from '@prisma/client';

import { prisma } from './prisma';

/**
 * Emit a platform-operator notification (the admin console bell / inbox).
 *
 * Every emitted event carries a `permission` key that gates who receives it:
 * only operators whose RBAC role grants that permission (super admins: all) see
 * it in their inbox - so notifications respect the same access-control rules as
 * the rest of the console. Pass `permission: null` for an all-operators notice.
 *
 * This is best-effort and MUST never break the action that triggered it, so
 * callers `void` the promise and failures are swallowed with a console warning.
 */
export async function emitAdminEvent(event: {
  type: AdminEventType;
  severity?: AdminEventSeverity;
  title: string;
  body: string;
  /** RBAC gate - permission an operator must hold to receive this. null = all. */
  permission?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** Deep link into the console, e.g. `/aml/<id>`. */
  link?: string | null;
  actorId?: string | null;
}): Promise<void> {
  try {
    await prisma.adminNotification.create({
      data: {
        type: event.type,
        severity: event.severity ?? 'INFO',
        title: event.title,
        body: event.body,
        permission: event.permission ?? null,
        entityType: event.entityType ?? null,
        entityId: event.entityId ?? null,
        link: event.link ?? null,
        actorId: event.actorId ?? null,
      },
    });
  } catch (error) {
    console.warn('[admin-events] failed to emit', event.type, error);
  }
}
