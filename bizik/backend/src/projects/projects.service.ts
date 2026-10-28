import { ContractStatus, MilestoneStatus } from '@prisma/client';

import { AppError } from '../lib/errors';
import { recordAudit } from '../lib/audit';
import { EscrowRepository } from '../escrow/escrow.repository';
import { EscrowService } from '../escrow/escrow.service';
import { FileService } from '../file/file.service';
import { ProjectListFilter, ProjectsRepository } from './projects.repository';

type ListContract = Awaited<ReturnType<typeof ProjectsRepository.list>>[number];
type DetailContract = NonNullable<Awaited<ReturnType<typeof ProjectsRepository.getById>>>;
type ProjectUser = {
  id: string;
  fullName: string;
  email: string;
  country: string | null;
  status: string;
};

const STATUS_LABEL: Record<ContractStatus, string> = {
  DRAFT: 'Draft',
  INVITED: 'Invited',
  UNDER_REVIEW: 'Under review',
  SIGNED: 'Signed',
  FUNDED: 'Funded',
  IN_PROGRESS: 'In progress',
  IN_REVIEW: 'In review',
  DISPUTED: 'Disputed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  PENDING: 'Pending',
  FUNDED: 'Funded',
  ACTIVE: 'Active',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  RELEASED: 'Released',
  DISPUTED: 'Disputed',
  CANCELLED: 'Cancelled',
};

/** Milestone statuses where money is still held in escrow. */
const HELD_STATUSES: MilestoneStatus[] = ['FUNDED', 'ACTIVE', 'SUBMITTED', 'APPROVED'];

/** A short, stable, human project reference derived from the contract id. */
function caseReference(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }
  return `QPR-${(Math.abs(hash) % 9000) + 1000}`;
}

function personDto(userId: string | null, usersById: Map<string, ProjectUser>) {
  if (!userId) return null;
  const user = usersById.get(userId);
  if (!user) return null;
  return { id: user.id, fullName: user.fullName, email: user.email, status: user.status };
}

function listItemDto(contract: ListContract, usersById: Map<string, ProjectUser>) {
  const released = contract.milestones.filter((milestone) => milestone.status === 'RELEASED').length;
  return {
    id: contract.id,
    title: contract.title,
    status: contract.status,
    statusLabel: STATUS_LABEL[contract.status],
    currency: contract.currency,
    totalAmount: Number(contract.totalAmount),
    creator: personDto(contract.creatorId, usersById),
    counterparty: contract.counterpartyId
      ? personDto(contract.counterpartyId, usersById)
      : { id: null, fullName: contract.counterpartyName, email: contract.counterpartyEmail, status: 'INVITED' },
    milestoneCount: contract.milestones.length,
    milestonesReleased: released,
    createdAt: contract.createdAt,
    updatedAt: contract.updatedAt,
  };
}

export const ProjectsService = {
  /** Paginated contract list for the console (contracts.view). */
  async list(filters: ProjectListFilter, page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;
    const [contracts, total] = await Promise.all([
      ProjectsRepository.list(filters, skip, pageSize),
      ProjectsRepository.count(filters),
    ]);
    const userIds = [
      ...new Set(
        contracts.flatMap((contract) =>
          [contract.creatorId, contract.counterpartyId].filter(Boolean),
        ),
      ),
    ] as string[];
    const users = (await ProjectsRepository.getUsersByIds(userIds)) as ProjectUser[];
    const usersById = new Map(users.map((user) => [user.id, user]));
    return {
      items: contracts.map((contract) => listItemDto(contract, usersById)),
      page,
      pageSize,
      total,
    };
  },

  /** KPI counts for the console header. */
  async stats() {
    const counts = await ProjectsRepository.statusCounts();
    const at = (status: ContractStatus) => counts[status] ?? 0;
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    return {
      total,
      active: at('SIGNED') + at('FUNDED') + at('IN_PROGRESS') + at('IN_REVIEW'),
      disputed: at('DISPUTED'),
      completed: at('COMPLETED'),
      cancelled: at('CANCELLED'),
      draftOrInvited: at('DRAFT') + at('INVITED') + at('UNDER_REVIEW'),
    };
  },

  async detail(id: string) {
    const contract = await ProjectsRepository.getById(id);
    if (!contract) throw new AppError(404, 'Q-404', 'Project not found');
    const userIds = [contract.creatorId, contract.counterpartyId].filter(Boolean) as string[];
    const users = (await ProjectsRepository.getUsersByIds(userIds)) as ProjectUser[];
    const usersById = new Map(users.map((user) => [user.id, user]));
    const [escrow, platformFees] = await Promise.all([
      EscrowService._summaryCore(contract.id),
      ProjectsRepository.sumFees(contract.id),
    ]);

    // Resolve delivery-submission images to hosted URLs so operators can review
    // what was actually delivered (SRS FR-ADM-006).
    const submissionFileIds = contract.milestones.flatMap((milestone) =>
      milestone.submissions.flatMap((submission) => submission.fileIds),
    );
    const submissionUrls = new Map(
      (await FileService.urlsForIds(submissionFileIds)).map((file) => [file.id, file.url]),
    );

    return {
      id: contract.id,
      reference: caseReference(contract.id),
      title: contract.title,
      description: contract.description,
      category: contract.category,
      status: contract.status,
      statusLabel: STATUS_LABEL[contract.status],
      currency: contract.currency,
      totalAmount: Number(contract.totalAmount),
      platformFees,
      creatorIsPayer: contract.creatorIsPayer,
      inspectionDays: contract.inspectionDays,
      creator: personDto(contract.creatorId, usersById),
      counterparty: contract.counterpartyId
        ? personDto(contract.counterpartyId, usersById)
        : {
            id: null,
            fullName: contract.counterpartyName,
            email: contract.counterpartyEmail,
            status: 'INVITED',
          },
      payerSide: contract.creatorIsPayer ? 'creator' : 'counterparty',
      milestones: contract.milestones.map((milestone) => ({
        id: milestone.id,
        order: milestone.order,
        title: milestone.title,
        description: milestone.description,
        amount: Number(milestone.amount),
        currency: milestone.currency,
        status: milestone.status,
        statusLabel: MILESTONE_STATUS_LABEL[milestone.status],
        deadline: milestone.deadline,
        revisionCount: milestone.revisionCount,
        maxRevisions: milestone.maxRevisions,
        submittedAt: milestone.submittedAt,
        approvedAt: milestone.approvedAt,
        releasedAt: milestone.releasedAt,
        deliverables: milestone.deliverables.map((deliverable) => ({
          id: deliverable.id,
          description: deliverable.description,
          fileId: deliverable.fileId,
        })),
        submissions: milestone.submissions.map((submission) => ({
          id: submission.id,
          note: submission.note,
          fileIds: submission.fileIds,
          images: submission.fileIds.map((fid) => submissionUrls.get(fid)).filter(Boolean) as string[],
          createdAt: submission.createdAt,
        })),
      })),
      escrow,
      amendments: contract.amendments.length,
      invitations: contract.invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        status: invitation.status,
        createdAt: invitation.createdAt,
      })),
      signatures: contract.signatures.length,
      timeline: buildTimeline(contract),
      createdAt: contract.createdAt,
      updatedAt: contract.updatedAt,
      cancelledAt: contract.cancelledAt,
      cancellationReason: contract.cancellationReason,
      completedAt: contract.completedAt,
    };
  },

  /** Force-cancel a stuck contract and refund held escrow (contracts.manage). */
  async forceCancel(adminId: string, id: string, reason?: string) {
    const contract = await EscrowRepository.getContract(id);
    if (!contract) throw new AppError(404, 'Q-404', 'Project not found');
    await EscrowService._cancelCore(contract, adminId, reason);
    void recordAudit({
      actorId: adminId,
      action: 'project.force_cancel',
      entityType: 'Contract',
      entityId: id,
      before: { status: contract.status },
      after: { status: 'CANCELLED', reason },
    });
    return this.detail(id);
  },

  /**
   * Force-complete a contract: release any held escrow to the payee and mark
   * the contract COMPLETED (contracts.manage). Blocked while a dispute is open.
   */
  async forceComplete(adminId: string, id: string) {
    const contract = await EscrowRepository.getContract(id);
    if (!contract) throw new AppError(404, 'Q-404', 'Project not found');
    if (contract.status === 'COMPLETED' || contract.status === 'CANCELLED') {
      throw new AppError(409, 'Q-409', 'This project is already closed.');
    }
    if (contract.milestones.some((milestone) => milestone.status === 'DISPUTED')) {
      throw new AppError(409, 'Q-409', 'Resolve the open dispute before completing.');
    }

    const releasable = contract.milestones.filter((milestone) =>
      HELD_STATUSES.includes(milestone.status),
    );
    for (const milestone of releasable) {
      await EscrowService._releaseCore(milestone.id, { actorUserId: adminId, auto: true });
    }
    const fresh = await ProjectsRepository.getById(id);
    if (fresh && fresh.status !== 'COMPLETED') {
      await ProjectsRepository.markCompleted(id);
    }
    void recordAudit({
      actorId: adminId,
      action: 'project.force_complete',
      entityType: 'Contract',
      entityId: id,
      before: { status: contract.status },
      after: { status: 'COMPLETED', releasedMilestones: releasable.length },
    });
    return this.detail(id);
  },

  // ---- Templates (templates.manage) ----
  async templates() {
    const templates = await ProjectsRepository.listTemplates();
    return templates.map((template) => ({
      id: template.id,
      name: template.name,
      category: template.category,
      isSystem: template.isSystem,
      milestones: template._count.milestones,
      ownerId: template.ownerId,
      createdAt: template.createdAt,
    }));
  },

  async deleteTemplate(adminId: string, id: string) {
    const template = await ProjectsRepository.getTemplate(id);
    if (!template) throw new AppError(404, 'Q-404', 'Template not found');
    if (template.isSystem) {
      throw new AppError(409, 'Q-409', 'System templates cannot be deleted.');
    }
    await ProjectsRepository.deleteTemplate(id);
    void recordAudit({
      actorId: adminId,
      action: 'template.delete',
      entityType: 'ContractTemplate',
      entityId: id,
      before: { name: template.name },
    });
    return { ok: true };
  },
};

/** A derived chronological timeline from the contract's own timestamps. */
function buildTimeline(contract: DetailContract) {
  const events: { label: string; at: Date }[] = [{ label: 'Project created', at: contract.createdAt }];
  if (contract.acceptedAt) events.push({ label: 'Counterparty accepted', at: contract.acceptedAt });
  if (contract.fundedAt) events.push({ label: 'Escrow funded', at: contract.fundedAt });
  for (const milestone of contract.milestones) {
    if (milestone.submittedAt)
      events.push({ label: `Milestone submitted: ${milestone.title}`, at: milestone.submittedAt });
    if (milestone.releasedAt)
      events.push({ label: `Milestone released: ${milestone.title}`, at: milestone.releasedAt });
  }
  if (contract.completedAt) events.push({ label: 'Project completed', at: contract.completedAt });
  if (contract.cancelledAt) events.push({ label: 'Project cancelled', at: contract.cancelledAt });
  return events
    .sort((first, second) => first.at.getTime() - second.at.getTime())
    .map((event) => ({ label: event.label, at: event.at.toISOString() }));
}
