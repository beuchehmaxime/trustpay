import {
  Contract,
  DisputeReason,
  DisputeRulingType,
  DisputeStatus,
  Milestone,
} from '@prisma/client';

import { AppError } from '../lib/errors';
import { recordAudit } from '../lib/audit';
import { emitAdminEvent } from '../lib/admin-events';
import { resolveParties } from '../lib/contract-flow';
import { ensureAiRecommendation } from '../lib/dispute-ai';
import { FileService } from '../file/file.service';
import { round2 } from '../lib/fees';
import { DisputeService } from '../dispute/dispute.service';
import { DisputeAdminRepository, DisputeListFilter } from './disputeadmin.repository';
import { ResolveInput } from '../dispute/dispute.validation';

type FullContract = Contract & { milestones: Milestone[] };
type NamedUser = { id: string; fullName: string; email: string };

const STATUS_LABEL: Record<DisputeStatus, string> = {
  FILED: 'Filed',
  AWAITING_RESPONSE: 'Awaiting response',
  UNDER_REVIEW: 'Under review',
  ESCALATED: 'Escalated',
  RESOLVED: 'Resolved',
  AUTO_RULED: 'Auto-resolved',
};

const REASON_LABEL: Record<DisputeReason, string> = {
  NON_DELIVERY: 'Non-delivery',
  INCOMPLETE_WORK: 'Incomplete work',
  QUALITY_BELOW_SPEC: 'Quality below spec',
  SCOPE_CREEP: 'Scope creep',
  COMMUNICATION_BREAKDOWN: 'Communication breakdown',
  OTHER: 'Other',
};

const OPEN: DisputeStatus[] = ['FILED', 'AWAITING_RESPONSE', 'UNDER_REVIEW', 'ESCALATED'];

/** Reason-based baseline lean for the suggested ruling (payee share %). */
const REASON_LEAN: Record<DisputeReason, { pct: number; confidence: number }> = {
  NON_DELIVERY: { pct: 0, confidence: 0.75 },
  INCOMPLETE_WORK: { pct: 40, confidence: 0.6 },
  QUALITY_BELOW_SPEC: { pct: 50, confidence: 0.55 },
  SCOPE_CREEP: { pct: 70, confidence: 0.6 },
  COMMUNICATION_BREAKDOWN: { pct: 50, confidence: 0.5 },
  OTHER: { pct: 50, confidence: 0.45 },
};

/** Classify a user against the contract's parties for role badges. */
function roleOf(
  userId: string | null,
  payerId: string | null,
  payeeId: string | null,
): 'payer' | 'payee' | 'mediator' {
  if (userId && userId === payerId) return 'payer';
  if (userId && userId === payeeId) return 'payee';
  return 'mediator';
}

function rulingFor(pct: number): DisputeRulingType {
  if (pct >= 100) return 'FULL_RELEASE';
  if (pct <= 0) return 'FULL_REFUND';
  return 'PARTIAL_SPLIT';
}

export const DisputeAdminService = {
  /** Paginated dispute list for the console (disputes.view). */
  async list(filters: DisputeListFilter, page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;
    const [disputes, total] = await Promise.all([
      DisputeAdminRepository.list(filters, skip, pageSize),
      DisputeAdminRepository.count(filters),
    ]);
    const contractIds = [...new Set(disputes.map((dispute) => dispute.contractId))];
    const contracts = await Promise.all(
      contractIds.map((id) => DisputeAdminRepository.getContract(id)),
    );
    const contractById = new Map(
      contracts.filter(Boolean).map((contract) => [contract!.id, contract as FullContract]),
    );
    const mediatorIds = [
      ...new Set(disputes.flatMap((dispute) => dispute.assignments.map((a) => a.mediatorId))),
    ];
    const mediators = (await DisputeAdminRepository.getUsersByIds(mediatorIds)) as NamedUser[];
    const mediatorById = new Map(mediators.map((user) => [user.id, user]));

    return {
      items: disputes.map((dispute) => {
        const contract = contractById.get(dispute.contractId);
        const milestone = contract?.milestones.find((m) => m.id === dispute.milestoneId);
        const activeAssignment = dispute.assignments[0];
        return {
          id: dispute.id,
          status: dispute.status,
          statusLabel: STATUS_LABEL[dispute.status],
          reason: dispute.reason,
          reasonLabel: REASON_LABEL[dispute.reason],
          contractId: dispute.contractId,
          contractTitle: contract?.title ?? 'Project',
          milestoneTitle: milestone?.title ?? 'Milestone',
          amount: milestone ? Number(milestone.amount) : 0,
          currency: contract?.currency ?? 'USD',
          mediatorName: activeAssignment
            ? (mediatorById.get(activeAssignment.mediatorId)?.fullName ?? 'Assigned')
            : null,
          createdAt: dispute.createdAt,
          resolvedAt: dispute.resolvedAt,
        };
      }),
      page,
      pageSize,
      total,
    };
  },

  async stats() {
    const rows = await DisputeAdminRepository.statusCounts();
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.status] = row._count._all;
    return {
      total: rows.reduce((sum, row) => sum + row._count._all, 0),
      open: OPEN.reduce((sum, status) => sum + (counts[status] ?? 0), 0),
      escalated: counts.ESCALATED ?? 0,
      resolved: (counts.RESOLVED ?? 0) + (counts.AUTO_RULED ?? 0),
    };
  },

  /** Operators eligible to mediate (disputes.view). */
  async mediators() {
    const list = await DisputeAdminRepository.listMediators();
    return list.map((user) => ({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.adminRole?.name ?? 'Operator',
    }));
  },

  async detail(id: string) {
    // Ensure the case has an AI recommendation before we read it (lazy backfill).
    await ensureAiRecommendation(id);
    const dispute = await DisputeAdminRepository.getFull(id);
    if (!dispute) throw new AppError(404, 'Q-404', 'Dispute not found');
    const contract = (await DisputeAdminRepository.getContract(
      dispute.contractId,
    )) as FullContract | null;
    if (!contract) throw new AppError(404, 'Q-404', 'Project not found');
    const milestone = contract.milestones.find((m) => m.id === dispute.milestoneId);
    const account = await DisputeAdminRepository.getAccount(contract.id);
    const { payerId, payeeId } = resolveParties(contract);

    const userIds = [
      contract.creatorId,
      contract.counterpartyId,
      dispute.filedById,
      ...dispute.messages.map((m) => m.senderId),
      ...dispute.evidence.map((e) => e.submittedById),
      ...dispute.responses.map((r) => r.respondentId),
      ...dispute.assignments.map((a) => a.mediatorId),
    ].filter(Boolean) as string[];
    const users = (await DisputeAdminRepository.getUsersByIds([...new Set(userIds)])) as NamedUser[];
    const nameOf = (uid: string | null) =>
      uid ? (users.find((user) => user.id === uid)?.fullName ?? 'Someone') : '';

    // Resolve dispute-evidence images to hosted URLs for the mediator to view.
    const evidenceUrls = new Map(
      (await FileService.urlsForIds(dispute.evidence.flatMap((item) => item.fileIds))).map(
        (file) => [file.id, file.url],
      ),
    );

    const payerName = contract.creatorIsPayer ? nameOf(contract.creatorId) : contract.counterpartyName;
    const payeeName = contract.creatorIsPayer ? contract.counterpartyName : nameOf(contract.creatorId);
    const amount = milestone ? round2(Number(milestone.amount)) : 0;
    const activeAssignment = dispute.assignments.find((a) => !a.recusedAt);
    const open = dispute.status !== 'RESOLVED' && dispute.status !== 'AUTO_RULED';

    // Suggested resolution: prefer a stored AI recommendation, else a heuristic.
    const suggestion = dispute.aiRec
      ? {
          ruling: dispute.aiRec.recommendation,
          freelancerPct:
            dispute.aiRec.recommendation === 'FULL_RELEASE'
              ? 100
              : dispute.aiRec.recommendation === 'FULL_REFUND'
                ? 0
                : dispute.aiRec.freelancerPct,
          confidence: Number(dispute.aiRec.confidence),
          rationale: dispute.aiRec.rationale ?? 'Model recommendation.',
          source: 'model' as const,
        }
      : this.suggestRuling(dispute.reason, dispute.evidence, payerId, payeeId);

    return {
      id: dispute.id,
      status: dispute.status,
      statusLabel: STATUS_LABEL[dispute.status],
      reason: dispute.reason,
      reasonLabel: REASON_LABEL[dispute.reason],
      description: dispute.description,
      contractId: dispute.contractId,
      contractTitle: contract.title,
      milestoneId: dispute.milestoneId,
      milestoneTitle: milestone?.title ?? 'Milestone',
      amount,
      currency: contract.currency,
      escrowStatus: account?.status ?? null,
      open,
      filedByName: nameOf(dispute.filedById),
      filedByRole: dispute.filedById === payerId ? 'payer' : 'payee',
      payerName,
      payeeName,
      responseDeadline: dispute.responseDeadline,
      createdAt: dispute.createdAt,
      resolvedAt: dispute.resolvedAt,
      mediator: activeAssignment
        ? { id: activeAssignment.mediatorId, name: nameOf(activeAssignment.mediatorId) }
        : null,
      evidence: dispute.evidence.map((item) => ({
        id: item.id,
        by: nameOf(item.submittedById),
        byRole: item.submittedById === payerId ? 'payer' : 'payee',
        description: item.description,
        files: item.fileIds.length,
        images: item.fileIds.map((fid) => evidenceUrls.get(fid)).filter(Boolean) as string[],
        createdAt: item.createdAt,
      })),
      responses: dispute.responses.map((item) => ({
        id: item.id,
        by: nameOf(item.respondentId),
        byRole: roleOf(item.respondentId, payerId, payeeId),
        rebuttal: item.rebuttal,
        createdAt: item.createdAt,
      })),
      messages: dispute.messages.map((item) => ({
        id: item.id,
        by: nameOf(item.senderId),
        byRole: roleOf(item.senderId, payerId, payeeId),
        body: item.body,
        createdAt: item.createdAt,
      })),
      timeline: dispute.timeline.map((item) => ({
        event: item.event,
        createdAt: item.createdAt,
      })),
      ruling: dispute.ruling
        ? {
            ruling: dispute.ruling.ruling,
            freelancerPct: dispute.ruling.freelancerPct,
            clientPct: dispute.ruling.clientPct,
            rationale: dispute.ruling.rationale,
            ruledAt: dispute.ruling.ruledAt,
          }
        : null,
      suggestion,
    };
  },

  /** Heuristic suggested ruling from the reason + evidence balance. */
  suggestRuling(
    reason: DisputeReason,
    evidence: { submittedById: string }[],
    payerId: string | null,
    payeeId: string | null,
  ) {
    const base = REASON_LEAN[reason];
    const payerEvidence = evidence.filter((item) => item.submittedById === payerId).length;
    const payeeEvidence = evidence.filter((item) => item.submittedById === payeeId).length;
    let pct = base.pct;
    if (payeeEvidence > payerEvidence) pct += 10;
    else if (payerEvidence > payeeEvidence) pct -= 10;
    pct = Math.max(0, Math.min(100, pct));
    const ruling = rulingFor(pct);
    const rationale =
      ruling === 'FULL_REFUND'
        ? `The reason (${REASON_LABEL[reason].toLowerCase()}) and the evidence favour refunding the client.`
        : ruling === 'FULL_RELEASE'
          ? `The evidence favours releasing the full amount to the freelancer.`
          : `A ${pct}/${100 - pct} split (freelancer/client) reflects partial delivery for ${REASON_LABEL[reason].toLowerCase()}.`;
    return { ruling, freelancerPct: pct, confidence: base.confidence, rationale, source: 'heuristic' as const };
  },

  /** Assign a mediator (disputes.assign) → moves the case into review. */
  async assign(adminId: string, id: string, mediatorId: string) {
    const dispute = await DisputeAdminRepository.getFull(id);
    if (!dispute) throw new AppError(404, 'Q-404', 'Dispute not found');
    if (dispute.status === 'RESOLVED' || dispute.status === 'AUTO_RULED') {
      throw new AppError(409, 'Q-409', 'This dispute is already closed.');
    }
    await DisputeAdminRepository.createAssignment(id, mediatorId);
    if (dispute.status === 'FILED' || dispute.status === 'AWAITING_RESPONSE') {
      await DisputeAdminRepository.setStatus(id, 'UNDER_REVIEW');
    }
    await DisputeAdminRepository.addTimeline(id, 'MEDIATOR_ASSIGNED', adminId);
    void recordAudit({
      actorId: adminId,
      action: 'dispute.assign',
      entityType: 'Dispute',
      entityId: id,
      after: { mediatorId },
    });
    return this.detail(id);
  },

  /** Escalate to senior arbitration (disputes.assign). */
  async escalate(adminId: string, id: string, note?: string) {
    const dispute = await DisputeAdminRepository.getFull(id);
    if (!dispute) throw new AppError(404, 'Q-404', 'Dispute not found');
    if (dispute.status === 'RESOLVED' || dispute.status === 'AUTO_RULED') {
      throw new AppError(409, 'Q-409', 'This dispute is already closed.');
    }
    await DisputeAdminRepository.setStatus(id, 'ESCALATED');
    await DisputeAdminRepository.addTimeline(id, note ? `ESCALATED: ${note}` : 'ESCALATED', adminId);
    void recordAudit({
      actorId: adminId,
      action: 'dispute.escalate',
      entityType: 'Dispute',
      entityId: id,
      after: { note },
    });
    void emitAdminEvent({
      type: 'DISPUTE_ESCALATED',
      severity: 'WARNING',
      title: 'Dispute escalated',
      body: `A dispute was escalated for senior review${note ? `: ${note}` : '.'}`,
      permission: 'disputes.view',
      entityType: 'Dispute',
      entityId: id,
      link: `/disputes/${id}`,
      actorId: adminId,
    });
    return this.detail(id);
  },

  /** Post a mediator message to the case thread (disputes.resolve). */
  async message(adminId: string, id: string, body: string) {
    const dispute = await DisputeAdminRepository.getFull(id);
    if (!dispute) throw new AppError(404, 'Q-404', 'Dispute not found');
    await DisputeAdminRepository.addMessage(id, adminId, body);
    return this.detail(id);
  },

  /**
   * Issue a binding ruling (disputes.resolve). Reuses the party-facing
   * DisputeService money-movement (release / refund / split) with the admin
   * role so all ruling types are permitted, then records an audit entry.
   */
  async rule(adminId: string, id: string, input: ResolveInput) {
    await DisputeService.resolve(adminId, id, input, 'admin');
    void recordAudit({
      actorId: adminId,
      action: 'dispute.rule',
      entityType: 'Dispute',
      entityId: id,
      after: { ruling: input.ruling, freelancerPct: input.freelancerPct },
    });
    return this.detail(id);
  },
};
