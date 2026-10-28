/** Audit log types - mirrors backend AuditAdminService (SRS FR-ADM-006). */

export interface AuditActor {
  id: string | null;
  name: string;
  role: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  result: 'SUCCESS' | 'FAILED';
  entityType: string;
  entityId: string | null;
  actor: AuditActor;
  target: string;
  ipAddress: string | null;
  userAgent: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface AuditFilterOptions {
  actions: string[];
  actors: { id: string; name: string; role: string }[];
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AuditFilters {
  search?: string;
  action?: string;
  actorId?: string;
  result?: 'SUCCESS' | 'FAILED';
  days?: number;
  page?: number;
  pageSize?: number;
}
