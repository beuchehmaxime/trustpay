import { AuditLog } from '@prisma/client';

import { AuditAdminRepository, AuditFilter } from './auditadmin.repository';

type ActorInfo = {
  id: string;
  fullName: string;
  email: string;
  adminRole: { name: string; isSuperAdmin: boolean } | null;
};

/** Human labels for the entity a log entry targets. */
const ENTITY_LABEL: Record<string, string> = {
  User: 'User',
  AmlAlert: 'AML alert',
  PayoutRequest: 'Payout',
  EscrowAccount: 'Escrow account',
  Milestone: 'Milestone',
  Contract: 'Project',
  ContractTemplate: 'Template',
  Dispute: 'Dispute',
  PlatformSetting: 'Fee settings',
  FxRate: 'FX rate',
  Session: 'Sign-in',
};

function roleLabel(actor?: ActorInfo): string {
  if (!actor) return 'System';
  if (actor.adminRole?.isSuperAdmin) return 'Super Admin';
  return actor.adminRole?.name ?? 'Operator';
}

/** Build a readable target string from the entity type/id + any state hints. */
function targetFor(log: AuditLog, actorByUser: Map<string, ActorInfo>): string {
  if (log.entityType === 'Session') return 'Admin console';
  if (log.entityType === 'User' && log.entityId) {
    return actorByUser.get(log.entityId)?.fullName ?? `User · ${log.entityId.slice(0, 8)}`;
  }
  if (log.entityType === 'PlatformSetting') return 'Fee settings';
  if (log.entityType === 'FxRate') return `FX rate · ${log.entityId ?? ''}`;
  const label = ENTITY_LABEL[log.entityType] ?? log.entityType;
  return log.entityId ? `${label} · ${log.entityId.slice(0, 8)}` : label;
}

export const AuditAdminService = {
  /** Paginated audit list (audit.view). */
  async list(
    filters: {
      action?: string;
      actorId?: string;
      result?: string;
      days?: number;
      search?: string;
    },
    page: number,
    pageSize: number,
  ) {
    const filter: AuditFilter = {
      action: filters.action,
      actorId: filters.actorId,
      result: filters.result,
      since: filters.days ? new Date(Date.now() - filters.days * 24 * 60 * 60 * 1000) : undefined,
      search: filters.search,
    };
    if (filters.search) {
      const matches = await AuditAdminRepository.findActorIdsBySearch(filters.search.trim());
      filter.searchActorIds = matches.map((match) => match.id);
    }

    const skip = (page - 1) * pageSize;
    const [logs, total] = await Promise.all([
      AuditAdminRepository.list(filter, skip, pageSize),
      AuditAdminRepository.count(filter),
    ]);

    // Resolve every id referenced by an actor OR a User target.
    const ids = [
      ...logs.map((log) => log.actorId),
      ...logs.filter((log) => log.entityType === 'User').map((log) => log.entityId),
    ].filter(Boolean) as string[];
    const users = (await AuditAdminRepository.getUsersByIds([...new Set(ids)])) as ActorInfo[];
    const usersById = new Map(users.map((user) => [user.id, user]));

    return {
      items: logs.map((log) => {
        const actor = log.actorId ? usersById.get(log.actorId) : undefined;
        return {
          id: log.id,
          action: log.action,
          result: log.result,
          entityType: log.entityType,
          entityId: log.entityId,
          actor: actor
            ? { id: actor.id, name: actor.fullName, role: roleLabel(actor) }
            : { id: null, name: 'System', role: 'Automation' },
          target: targetFor(log, usersById),
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          before: log.beforeState,
          after: log.afterState,
          createdAt: log.createdAt,
        };
      }),
      page,
      pageSize,
      total,
    };
  },

  /** Distinct actions + actors for the filter dropdowns (audit.view). */
  async filters() {
    const [actions, actorIdRows] = await Promise.all([
      AuditAdminRepository.distinctActions(),
      AuditAdminRepository.distinctActorIds(),
    ]);
    const actorIds = actorIdRows.map((row) => row.actorId).filter(Boolean) as string[];
    const actors = (await AuditAdminRepository.getUsersByIds(actorIds)) as ActorInfo[];
    return {
      actions: actions.map((row) => row.action),
      actors: actors.map((actor) => ({ id: actor.id, name: actor.fullName, role: roleLabel(actor) })),
    };
  },
};
