import { AmlAlert, AmlAlertStatus, AmlAlertType, SanctionsScreening } from '@prisma/client';

import { AuthRepository } from '../auth/auth.repository';
import { AuthService } from '../auth/auth.service';
import { AppError } from '../lib/errors';
import { recordAudit } from '../lib/audit';
import { emitAdminEvent } from '../lib/admin-events';
import { AmlListFilter, AmlRepository } from './aml.repository';

type AlertUser = {
  id: string;
  fullName: string;
  email: string;
  country: string | null;
  role: string;
  status: string;
  kycTier: number;
};

const STATUS_LABEL: Record<AmlAlertStatus, string> = {
  NEW: 'New',
  UNDER_REVIEW: 'Under review',
  CLEARED: 'Cleared',
  ESCALATED: 'Escalated',
};

const TYPE_LABEL: Record<AmlAlertType, string> = {
  STRUCTURING: 'Structuring',
  SANCTIONS_MATCH: 'Sanctions match',
  HIGH_RISK_FLOW: 'High-risk flow',
  VELOCITY_ANOMALY: 'Velocity anomaly',
  PEP_MATCH: 'PEP match',
};

/** Human labels for audited case actions, shown on the case timeline. */
const ACTION_LABEL: Record<string, string> = {
  'aml.review': 'Moved to review',
  'aml.clear': 'Case cleared',
  'aml.escalate': 'Escalated to MLRO',
  'aml.file_sar': 'Suspicious Activity Report filed',
  'aml.freeze_account': 'Account frozen by compliance',
};

/** Baseline risk by alert type when the provider gives no match score. */
const TYPE_BASELINE_RISK: Record<AmlAlertType, number> = {
  SANCTIONS_MATCH: 95,
  STRUCTURING: 90,
  HIGH_RISK_FLOW: 80,
  PEP_MATCH: 75,
  VELOCITY_ANOMALY: 70,
};

/** A short, stable, human case reference derived from the alert id. */
function caseReference(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }
  return `AML-${(Math.abs(hash) % 9000) + 1000}`;
}

/** 0-100 risk score - the provider match score if present, else a type baseline. */
function riskScoreFor(alert: AmlAlert): number {
  const details = (alert.details ?? {}) as Record<string, unknown>;
  if (typeof details.score === 'number') return Math.round(details.score * 100);
  return TYPE_BASELINE_RISK[alert.type];
}

/** A plain-language explanation of why the case was raised. */
function whyTriggered(alert: AmlAlert): string {
  const details = (alert.details ?? {}) as Record<string, unknown>;
  const matchedList = details.matchedList ? String(details.matchedList) : null;
  const score = typeof details.score === 'number' ? `${Math.round(details.score * 100)}%` : null;
  switch (alert.type) {
    case 'SANCTIONS_MATCH':
      return `The subject's name matched the ${matchedList ?? 'sanctions'} list${
        score ? ` at ${score} confidence` : ''
      } during identity screening. The account was frozen automatically pending review.`;
    case 'PEP_MATCH':
      return `The subject matched a Politically Exposed Persons list${
        score ? ` at ${score} confidence` : ''
      }, requiring enhanced due diligence before the account is cleared.`;
    case 'STRUCTURING':
      return 'Multiple deposits just below the reporting threshold were followed by a rapid withdrawal - a pattern consistent with structuring.';
    case 'HIGH_RISK_FLOW':
      return 'Funds moved through the account in a pattern flagged as high-risk by the monitoring rules.';
    case 'VELOCITY_ANOMALY':
      return 'Transaction velocity for this account deviated sharply from its normal behaviour.';
    default:
      return 'Flagged by the AML monitoring rules for compliance review.';
  }
}

/** Compliance-facing view of an AML alert. */
function alertDto(alert: AmlAlert, user?: AlertUser) {
  return {
    id: alert.id,
    reference: caseReference(alert.id),
    type: alert.type,
    typeLabel: TYPE_LABEL[alert.type],
    status: alert.status,
    statusLabel: STATUS_LABEL[alert.status],
    riskScore: riskScoreFor(alert),
    whyTriggered: whyTriggered(alert),
    userId: alert.userId,
    transactionRef: alert.transactionRef,
    assignedToId: alert.assignedToId,
    details: alert.details,
    user: user
      ? {
          fullName: user.fullName,
          email: user.email,
          country: user.country,
          role: user.role.toLowerCase(),
          status: user.status,
          kycTier: user.kycTier,
        }
      : null,
    createdAt: alert.createdAt,
    reviewedAt: alert.reviewedAt,
  };
}

function screeningDto(screening: SanctionsScreening) {
  return {
    id: screening.id,
    provider: screening.provider,
    result: screening.result,
    matchData: screening.matchData,
    screenedAt: screening.screenedAt,
  };
}

async function loadAlert(id: string) {
  const alert = await AmlRepository.getById(id);
  if (!alert) throw new AppError(404, 'Q-404', 'AML alert not found');
  return alert;
}

async function userFor(userId: string | null): Promise<AlertUser | undefined> {
  if (!userId) return undefined;
  const [user] = (await AmlRepository.getUsersByIds([userId])) as AlertUser[];
  return user;
}

export const AmlService = {
  /** Alerts for the console list, narrowed by status/type/search. */
  async list(filters: AmlListFilter & { search?: string } = {}) {
    const alerts = await AmlRepository.list({ status: filters.status, type: filters.type });
    const userIds = [...new Set(alerts.map((alert) => alert.userId).filter(Boolean))] as string[];
    const users = (await AmlRepository.getUsersByIds(userIds)) as AlertUser[];
    const usersById = new Map(users.map((user) => [user.id, user]));

    let items = alerts.map((alert) =>
      alertDto(alert, alert.userId ? usersById.get(alert.userId) : undefined),
    );
    if (filters.search) {
      const needle = filters.search.trim().toLowerCase();
      items = items.filter((item) => {
        const haystack = `${item.user?.fullName ?? ''} ${item.user?.email ?? ''}`.toLowerCase();
        return haystack.includes(needle);
      });
    }
    return items;
  },

  /** KPI counts for the console header + sidebar badge. */
  async stats() {
    const counts = await AmlRepository.statusCounts();
    const open = counts.NEW + counts.UNDER_REVIEW + counts.ESCALATED;
    return {
      total: counts.NEW + counts.UNDER_REVIEW + counts.ESCALATED + counts.CLEARED,
      open,
      new: counts.NEW,
      underReview: counts.UNDER_REVIEW,
      escalated: counts.ESCALATED,
      cleared: counts.CLEARED,
    };
  },

  async detail(id: string) {
    const alert = await loadAlert(id);
    const user = await userFor(alert.userId);
    const screenings = alert.userId
      ? ((await AmlRepository.screeningsForUser(alert.userId)) as SanctionsScreening[])
      : [];
    return {
      ...alertDto(alert, user),
      screenings: screenings.map(screeningDto),
    };
  },

  /** Chronological case history built from the audit log (aml.view). */
  async timeline(id: string) {
    const alert = await loadAlert(id);
    const entries = await AmlRepository.auditForAlert(id, alert.userId);
    const events = entries.map((entry) => {
      const after = (entry.afterState ?? {}) as Record<string, unknown>;
      const label =
        entry.action === 'aml.note'
          ? String(after.note ?? 'Note added')
          : (ACTION_LABEL[entry.action] ?? entry.action);
      return {
        id: entry.id,
        kind: entry.action === 'aml.note' ? 'note' : 'event',
        label,
        at: entry.createdAt,
      };
    });
    // The opening of the case is implicit (created before any audited action).
    events.unshift({
      id: `open-${alert.id}`,
      kind: 'event',
      label: `Alert opened - ${TYPE_LABEL[alert.type]}`,
      at: alert.createdAt,
    });
    return events;
  },

  /** Append an investigation note to the case file (aml.resolve). */
  async addNote(actorId: string, id: string, note: string) {
    await loadAlert(id);
    await recordAudit({
      actorId,
      action: 'aml.note',
      entityType: 'AmlAlert',
      entityId: id,
      after: { note },
    });
    return this.timeline(id);
  },

  /** Take ownership and move a NEW alert into review (aml.resolve). */
  async startReview(actorId: string, id: string) {
    const alert = await loadAlert(id);
    if (alert.status === 'CLEARED') {
      throw new AppError(409, 'Q-409', 'This alert is already cleared.');
    }
    const updated = await AmlRepository.updateAlert(id, {
      status: 'UNDER_REVIEW',
      assignedToId: actorId,
    });
    void recordAudit({
      actorId,
      action: 'aml.review',
      entityType: 'AmlAlert',
      entityId: id,
      before: { status: alert.status },
      after: { status: updated.status, assignedToId: actorId },
    });
    return this.detail(id);
  },

  /** Clear an alert as a false positive; unfreezes the account if frozen. */
  async clear(actorId: string, id: string, note?: string) {
    const alert = await loadAlert(id);
    let accountUnfrozen = false;
    if (alert.userId) {
      const user = await AuthRepository.findUserById(alert.userId);
      if (user?.status === 'FROZEN') {
        await AuthRepository.updateUser(alert.userId, { status: 'ACTIVE' });
        accountUnfrozen = true;
      }
    }
    const updated = await AmlRepository.updateAlert(id, {
      status: 'CLEARED',
      assignedToId: actorId,
      reviewedAt: new Date(),
    });
    void recordAudit({
      actorId,
      action: 'aml.clear',
      entityType: 'AmlAlert',
      entityId: id,
      before: { status: alert.status },
      after: { status: updated.status, note, accountUnfrozen },
    });
    return this.detail(id);
  },

  /** Escalate to a senior Compliance Officer / MLRO (aml.resolve). */
  async escalate(actorId: string, id: string, note?: string) {
    const alert = await loadAlert(id);
    const updated = await AmlRepository.updateAlert(id, {
      status: 'ESCALATED',
      assignedToId: actorId,
      reviewedAt: new Date(),
    });
    void recordAudit({
      actorId,
      action: 'aml.escalate',
      entityType: 'AmlAlert',
      entityId: id,
      before: { status: alert.status },
      after: { status: updated.status, note },
    });
    return this.detail(id);
  },

  /** Freeze the subject account from the case (accounts.freeze). */
  async freezeAccount(actorId: string, id: string) {
    const alert = await loadAlert(id);
    if (!alert.userId) throw new AppError(400, 'Q-400', 'This alert has no linked account.');
    const user = await AuthRepository.findUserById(alert.userId);
    if (!user) throw new AppError(404, 'Q-404', 'Linked account not found.');
    if (user.status !== 'FROZEN') {
      await AuthRepository.updateUser(alert.userId, { status: 'FROZEN' });
      await AuthService.revokeEverything(alert.userId);
      void emitAdminEvent({
        type: 'ACCOUNT_FROZEN',
        severity: 'WARNING',
        title: 'Account frozen',
        body: `${user.fullName}'s account was frozen from AML case ${caseReference(id)}.`,
        permission: 'aml.view',
        entityType: 'User',
        entityId: alert.userId,
        link: `/aml/${id}`,
        actorId,
      });
    }
    void recordAudit({
      actorId,
      action: 'aml.freeze_account',
      entityType: 'User',
      entityId: alert.userId,
      before: { status: user.status },
      after: { status: 'FROZEN', viaAlert: id },
    });
    return this.detail(id);
  },

  /**
   * File a Suspicious Activity Report for this case (aml.resolve). Persists a
   * Report and escalates the alert so it stays visible until closed out.
   */
  async fileSar(actorId: string, id: string, narrative: string) {
    const alert = await loadAlert(id);
    const report = await AmlRepository.createReport({
      type: 'SUSPICIOUS_ACTIVITY',
      generatedById: actorId,
    });
    const updated = await AmlRepository.updateAlert(id, {
      status: 'ESCALATED',
      assignedToId: actorId,
      reviewedAt: new Date(),
    });
    void recordAudit({
      actorId,
      action: 'aml.file_sar',
      entityType: 'AmlAlert',
      entityId: id,
      before: { status: alert.status },
      after: { status: updated.status, reportId: report.id, narrative },
    });
    return this.detail(id);
  },
};
