import { Contract, EscrowAccount, Milestone, MilestoneStatus } from '@prisma/client';

import { config } from '../config/env';
import { isLiveMilestone, recomputeContractStatus, resolveParties } from '../lib/contract-flow';
import {
  accentFor,
  CONTRACT_STATUS_LABEL,
  homeCurrencyFor,
  MILESTONE_STATUS_LABEL,
} from '../lib/domain';
import { AppError } from '../lib/errors';
import { isCurrencyEnabled, systemSettings } from '../lib/system-settings';
import { round2 } from '../lib/fees';
import { usdRateOf } from '../lib/settings';
import { sendDealInviteSms } from '../lib/notify';
import { normalizePhone } from '../lib/phone';
import { FileService } from '../file/file.service';
import { NotificationService } from '../notification/notification.service';
import { WhatsAppNotify } from '../whatsapp/whatsapp-notify';
import { prisma } from '../lib/prisma';
import { ContractRepository } from './contract.repository';
import {
  AddMilestoneInput,
  CreateProjectInput,
  EditCounterpartyInput,
  EditMilestoneInput,
  RevisionInput,
  SubmitWorkInput,
} from './contract.validation';

type Party = { id: string; fullName: string; country: string | null };
type FullContract = Contract & { milestones: Milestone[] };

/** Verified (KYC complete) accounts can create projects. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Map a project to the shape the mobile client renders, from the viewer's
 * perspective. There is no global client/freelancer role - the viewer is
 * either the payer or the payee for THIS project (`viewerRole`: 'client' =
 * payer/approver, 'freelancer' = payee/submitter).
 */
function shape(
  c: FullContract,
  userId: string,
  names: Map<string, Party>,
  escrow?: EscrowAccount | null,
) {
  const isCreator = c.creatorId === userId;
  const viewerIsPayer = c.creatorIsPayer ? isCreator : !isCreator;

  const creator = names.get(c.creatorId);
  const creatorName = creator?.fullName ?? 'Someone';
  const creatorCountry = creator?.country ?? '';

  // The creator sees the alias they saved; if they saved none, fall back to the
  // counterparty's own master account name (once they've joined), else a neutral
  // placeholder. The counterparty always sees the creator's real name.
  const counterpartyMasterName = c.counterpartyId ? names.get(c.counterpartyId)?.fullName : null;
  const counterpartyDisplay = c.counterpartyName ?? counterpartyMasterName ?? 'Invited user';
  const counterpartyName = isCreator ? counterpartyDisplay : creatorName;
  const counterpartyCountry = isCreator
    ? c.counterpartyId
      ? names.get(c.counterpartyId)?.country ?? ''
      : ''
    : creatorCountry;

  const payerName = c.creatorIsPayer ? creatorName : counterpartyDisplay;
  const payeeName = c.creatorIsPayer ? counterpartyDisplay : creatorName;

  // Cancelled milestones stay in the list for history but count for nothing.
  const liveMilestones = c.milestones.filter(isLiveMilestone);
  const done = liveMilestones.filter((m) => m.status === 'RELEASED').length;
  const statusLabel =
    c.status === 'CANCELLED'
      ? CONTRACT_STATUS_LABEL.CANCELLED
      : !c.accepted
        ? 'Pending'
        : CONTRACT_STATUS_LABEL[c.status];

  // The project's real currency/amount never change - but each viewer also gets
  // a display-only equivalent in their own home currency so a counterparty on a
  // different currency isn't confused (e.g. XAF project shown as ≈ NGN to a
  // Nigerian payee). Conversion uses the platform's live FX rates.
  const viewerCountry = names.get(userId)?.country ?? null;
  const viewerCurrency = homeCurrencyFor(viewerCountry);
  const fxToViewer =
    viewerCurrency === c.currency
      ? 1
      : Math.round((usdRateOf(c.currency) / usdRateOf(viewerCurrency)) * 1e8) / 1e8;

  // Escrow balances: use the real account when available, else derive from
  // milestone states (good enough for the list view).
  const heldStates: MilestoneStatus[] = ['FUNDED', 'ACTIVE', 'SUBMITTED'];
  const held = escrow
    ? Number(escrow.heldAmount)
    : liveMilestones.filter((m) => heldStates.includes(m.status)).reduce((s, m) => s + Number(m.amount), 0);
  const released = escrow
    ? Number(escrow.releasedAmount)
    : liveMilestones.filter((m) => m.status === 'RELEASED').reduce((s, m) => s + Number(m.amount), 0);
  const refunded = escrow ? Number(escrow.refundedAmount) : 0;
  const unfunded = liveMilestones
    .filter((m) => m.status === 'PENDING' || m.status === 'DISPUTED')
    .reduce((s, m) => s + Number(m.amount), 0);

  // Who may cancel what (the client renders the menu from these; the service
  // re-checks on every call). Only the creator can cancel their own deal, only
  // while nothing has been funded - see ContractService.cancel.
  const closed = c.status === 'CANCELLED' || c.status === 'COMPLETED';
  const canCancelDeal = isCreator && !closed && !hasMoneyMoved(c, escrow);

  return {
    id: c.id,
    title: c.title,
    counterparty: counterpartyName,
    counterpartyCountry,
    amount: Number(c.totalAmount),
    currency: c.currency,
    /** Display-only: the viewer's home currency + FX rate to convert the
     *  project-currency amounts for them. `fxToViewer` is 1 when they match. */
    viewerCurrency,
    fxToViewer,
    status: statusLabel,
    rawStatus: c.status,
    milestonesDone: done,
    milestonesTotal: liveMilestones.length,
    accent: accentFor(c.id),
    description: c.description ?? '',
    inspectionDays: c.inspectionDays,
    clientName: payerName,
    freelancerName: payeeName,
    viewerRole: viewerIsPayer ? ('client' as const) : ('freelancer' as const),
    isCreator,
    accepted: c.accepted,
    counterpartyEmail: c.counterpartyEmail,
    counterpartyPhone: c.counterpartyPhone,
    /** Shareable link the invitee can use to join + confirm (pending only). */
    inviteLink: `${config.appUrl}/invite/${c.id}`,
    createdAt: c.createdAt.toISOString().slice(0, 10),
    signedByClient: c.accepted,
    signedByFreelancer: c.accepted,
    cancellationReason: c.cancellationReason ?? null,
    fees: {
      clientServicePct: config.fees.clientServicePct,
      freelancerFeePct: config.fees.freelancerFeePct,
    },
    escrow: { held, released, refunded, unfunded },
    /** The creator can cancel the whole deal (nothing funded yet). */
    canCancel: canCancelDeal,
    milestones: c.milestones.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description ?? '',
      amount: Number(m.amount),
      currency: m.currency,
      status: MILESTONE_STATUS_LABEL[m.status],
      rawStatus: m.status,
      dueDate: (m.deadline ?? c.createdAt).toISOString().slice(0, 10),
      inspectionDays: m.inspectionDays,
      revisionCount: m.revisionCount,
      maxRevisions: m.maxRevisions,
      submittedAt: m.submittedAt ? m.submittedAt.toISOString() : null,
      autoReleaseAt: m.autoReleaseAt ? m.autoReleaseAt.toISOString() : null,
      /** The creator can cancel THIS milestone (it is still unfunded). */
      canCancel: isCreator && !closed && m.status === 'PENDING',
    })),
  };
}

/**
 * True once the deal has left the "nothing has happened yet" phase: a milestone
 * has been funded (or worked on, submitted, disputed, released), or escrow is
 * currently holding money for it. This is the line past which a deal can no
 * longer be cancelled - the parties refund or open a dispute instead.
 */
function hasMoneyMoved(c: FullContract, escrow?: EscrowAccount | null): boolean {
  const funded = c.milestones.some((m) => m.status !== 'PENDING' && m.status !== 'CANCELLED');
  return funded || (escrow ? Number(escrow.heldAmount) > 0 : false);
}

async function nameMap(contracts: FullContract[]): Promise<Map<string, Party>> {
  const ids = new Set<string>();
  contracts.forEach((c) => {
    ids.add(c.creatorId);
    if (c.counterpartyId) ids.add(c.counterpartyId);
  });
  const users = await ContractRepository.getUsersByIds([...ids]);
  return new Map(users.map((u) => [u.id, u]));
}

/** Load a milestone with its parent contract; throws if missing. */
async function loadMilestone(milestoneId: string) {
  const m = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    include: { contract: { include: { milestones: { orderBy: { order: 'asc' } } } } },
  });
  if (!m) throw new AppError(404, 'Q-404', 'Milestone not found');
  return m;
}

/** Is this user a party to the contract - by id, email or phone? */
function isUserParty(
  c: Pick<Contract, 'creatorId' | 'counterpartyId' | 'counterpartyEmail' | 'counterpartyPhone'>,
  userId: string,
  user: { email: string | null; phone: string | null } | null,
): boolean {
  if (c.creatorId === userId || c.counterpartyId === userId) return true;
  if (c.counterpartyEmail && user?.email && c.counterpartyEmail === user.email.toLowerCase()) return true;
  if (c.counterpartyPhone && user?.phone && c.counterpartyPhone === user.phone) return true;
  return false;
}

export const ContractService = {
  // ---- Create a project (requires a verified/KYC account) ----
  async create(userId: string, input: CreateProjectInput) {
    const creator = await prisma.user.findUnique({ where: { id: userId } });
    if (!creator) throw new AppError(404, 'Q-404', 'Account not found');
    const general = systemSettings().general;
    const requiredTier = systemSettings().verification.standardTier;
    if (general.kycRequiredForContracts && creator.kycTier < requiredTier) {
      throw new AppError(403, 'Q-422-KYC', 'Verify your account (complete KYC) before creating a project.');
    }
    if (!isCurrencyEnabled(input.currency)) {
      throw new AppError(400, 'Q-400', 'That currency is not available on BiZik right now.');
    }
    // Phone is the counterparty's BiZik identity - normalise it and use it to
    // find/invite them (email is no longer collected on the deal screen).
    const phone = normalizePhone(input.counterpartyPhone);

    if (creator.phone && phone === creator.phone) {
      throw new AppError(409, 'Q-409', "You can't invite yourself to a deal.");
    }

    // Resolve the counterparty to an existing account by phone.
    const counterparty = await ContractRepository.findUserByPhone(phone);
    const total = input.milestones.reduce((s, m) => s + m.amount, 0);

    const contract = (await ContractRepository.createProject({
      creatorId: userId,
      counterpartyId: counterparty?.id ?? null,
      // Alias the creator knows them by (optional). If they didn't provide one,
      // fall back to the matched account's master name, else leave it null (it
      // resolves to the counterparty's own name once they create their account).
      counterpartyName: input.counterpartyName?.trim() || counterparty?.fullName || null,
      counterpartyEmail: null,
      counterpartyPhone: phone,
      creatorIsPayer: input.creatorIsPayer,
      currency: input.currency,
      totalAmount: total,
      inspectionDays: input.inspectionDays ?? 5,
      description: input.description,
      title: input.title,
      milestones: input.milestones.map((m) => ({ ...m, currency: input.currency })),
    })) as FullContract;

    // SMS invite to the counterparty's phone.
    void sendDealInviteSms({
      to: phone,
      inviterName: creator.fullName,
      dealTitle: input.title,
      hasAccount: !!counterparty,
    }).catch((e) => console.error('[sms] invite failed:', (e as Error).message));

    // Proactive WhatsApp invite (accept/decline) - checks reachability and tells
    // the creator on their own WhatsApp whether the invitee was reached.
    void WhatsAppNotify.dealInvite(contract.id, { notifyCreator: true }).catch((e) =>
      console.error('[whatsapp] invite failed:', (e as Error).message),
    );

    const names = await nameMap([contract]);
    return shape(contract, userId, names);
  },

  async list(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true },
    });
    const contracts = (await ContractRepository.getForUser(
      userId,
      user?.email ?? '',
      user?.phone ?? null,
    )) as FullContract[];
    const names = await nameMap(contracts);
    const shaped = contracts.map((c) => shape(c, userId, names));
    return {
      mine: shaped.filter((c) => c.isCreator),
      invited: shaped.filter((c) => !c.isCreator),
    };
  },

  async byId(userId: string, id: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true },
    });
    const c = (await ContractRepository.getById(id)) as FullContract | null;
    const isParty = c && isUserParty(c, userId, user);
    if (!c || !isParty) throw new AppError(404, 'Q-404', 'Project not found');
    const [names, escrow] = await Promise.all([
      nameMap([c]),
      prisma.escrowAccount.findUnique({ where: { contractId: c.id } }),
    ]);
    const shaped = shape(c, userId, names, escrow);

    // Attach delivered images (Cloudinary URLs) per milestone so the payer can
    // review what was submitted before approving.
    const submissions = await ContractRepository.submissionsForMilestones(
      c.milestones.map((m) => m.id),
    );
    const urlById = new Map(
      (await FileService.urlsForIds(submissions.flatMap((s) => s.fileIds))).map((f) => [f.id, f.url]),
    );
    const imagesByMilestone = new Map<string, string[]>();
    const noteByMilestone = new Map<string, string>();
    for (const submission of submissions) {
      const urls = submission.fileIds.map((fid) => urlById.get(fid)).filter(Boolean) as string[];
      imagesByMilestone.set(submission.milestoneId, [
        ...(imagesByMilestone.get(submission.milestoneId) ?? []),
        ...urls,
      ]);
      // Keep the most recent non-empty submission note.
      if (submission.note && submission.note.trim()) {
        noteByMilestone.set(submission.milestoneId, submission.note.trim());
      }
    }
    // Attach the most recent revision request per milestone so the payee can see
    // exactly what the payer asked to be changed before resubmitting.
    const revisionRequests = await prisma.revisionRequest.findMany({
      where: { milestoneId: { in: c.milestones.map((m) => m.id) } },
      orderBy: { createdAt: 'desc' },
    });
    const revisionByMilestone = new Map<string, string>();
    for (const revision of revisionRequests) {
      const feedback = revision.feedback?.trim();
      if (feedback && !revisionByMilestone.has(revision.milestoneId)) {
        revisionByMilestone.set(revision.milestoneId, feedback);
      }
    }

    shaped.milestones = shaped.milestones.map((milestone) => ({
      ...milestone,
      deliveryImages: imagesByMilestone.get(milestone.id) ?? [],
      deliveryNote: noteByMilestone.get(milestone.id) ?? null,
      revisionNote: revisionByMilestone.get(milestone.id) ?? null,
    }));
    return shaped;
  },

  /** Counterparty confirms the project they were invited to. */
  async accept(userId: string, id: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true },
    });
    const c = (await ContractRepository.getById(id)) as FullContract | null;
    if (!c) throw new AppError(404, 'Q-404', 'Project not found');
    if (c.creatorId === userId) {
      throw new AppError(403, 'Q-403', "You created this project - you can't confirm it.");
    }
    if (!isUserParty(c, userId, user)) {
      throw new AppError(403, 'Q-403', 'This project was not shared with you.');
    }

    const updated = (await ContractRepository.accept(id, userId)) as FullContract;
    const names = await nameMap([updated]);
    void NotificationService.notifyProjectEvent({ contract: updated, actorId: userId, event: 'accepted' });
    return shape(updated, userId, names);
  },

  /** Let an invitee decline a deal invitation before it's confirmed. */
  async decline(userId: string, id: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true },
    });
    const c = (await ContractRepository.getById(id)) as FullContract | null;
    if (!c) throw new AppError(404, 'Q-404', 'Project not found');
    if (c.creatorId === userId) {
      throw new AppError(403, 'Q-403', "You created this project - you can't decline it.");
    }
    if (!isUserParty(c, userId, user)) {
      throw new AppError(403, 'Q-403', 'This project was not shared with you.');
    }
    if (c.accepted) {
      throw new AppError(409, 'Q-409', "You've already confirmed this project.");
    }

    const updated = (await ContractRepository.decline(id)) as FullContract;
    const names = await nameMap([updated]);
    void NotificationService.notifyProjectEvent({ contract: updated, actorId: userId, event: 'declined' });
    return shape(updated, userId, names);
  },

  /**
   * Decline by phone - for an invitee reached over WhatsApp who has NOT created
   * an account yet. Cancels the (never-funded) deal; invites can't be resent
   * afterwards. Matches the invitee by the deal's counterparty phone only.
   */
  async declineByPhone(phone: string, id: string) {
    const normalized = normalizePhone(phone);
    const c = (await ContractRepository.getById(id)) as FullContract | null;
    if (!c) throw new AppError(404, 'Q-404', 'Project not found');
    if (c.counterpartyPhone !== normalized) {
      throw new AppError(403, 'Q-403', 'This deal was not shared with you.');
    }
    if (c.accepted) {
      throw new AppError(409, 'Q-409', 'This deal has already been accepted.');
    }
    if (c.status === 'CANCELLED') return c; // idempotent - already declined
    return (await ContractRepository.decline(id)) as FullContract;
  },

  /**
   * The creator cancels their OWN deal. Allowed for as long as no money has been
   * committed - whether or not the other party has accepted it yet. Once any
   * milestone has been funded the deal is locked: the parties refund the funded
   * milestone or open a dispute instead of cancelling.
   */
  async cancel(userId: string, id: string, reason?: string) {
    const c = (await ContractRepository.getById(id)) as FullContract | null;
    if (!c) throw new AppError(404, 'Q-404', 'Project not found');
    if (c.creatorId !== userId) {
      throw new AppError(403, 'Q-403', 'Only the person who created this deal can cancel it.');
    }
    if (c.status === 'CANCELLED') return shape(c, userId, await nameMap([c])); // idempotent
    if (c.status === 'COMPLETED') {
      throw new AppError(409, 'Q-409', 'This deal is already completed - it can no longer be cancelled.');
    }
    const account = await prisma.escrowAccount.findUnique({ where: { contractId: c.id } });
    if (hasMoneyMoved(c, account)) {
      throw new AppError(
        409,
        'Q-409',
        'This deal has already been funded, so it can no longer be cancelled. Refund the funded milestone or open a dispute instead.',
      );
    }

    const updated = (await ContractRepository.cancel(id, reason)) as FullContract;
    const names = await nameMap([updated]);
    void NotificationService.notifyProjectEvent({ contract: updated, actorId: userId, event: 'project_cancelled' });
    // Tell the invitee on WhatsApp when they were invited by phone.
    void WhatsAppNotify.dealCancelledToInvitee(updated.id);
    return shape(updated, userId, names);
  },

  /**
   * The creator cancels ONE milestone of their deal. Only an unfunded (PENDING)
   * milestone can be cancelled - a funded one holds money, so it must be
   * refunded, released or disputed. Cancelling the last live milestone cancels
   * the whole deal with it (there is nothing left to deliver).
   */
  async cancelMilestone(userId: string, milestoneId: string) {
    const m = await loadMilestone(milestoneId);
    const c = m.contract as FullContract;
    if (c.creatorId !== userId) {
      throw new AppError(403, 'Q-403', 'Only the person who created this deal can cancel its milestones.');
    }
    if (c.status === 'CANCELLED' || c.status === 'COMPLETED') {
      throw new AppError(409, 'Q-409', 'This deal is closed.');
    }
    if (m.status === 'CANCELLED') return this.byId(userId, c.id); // idempotent
    if (m.status !== 'PENDING') {
      throw new AppError(
        409,
        'Q-409',
        'This milestone has already been funded, so it can no longer be cancelled. Refund, release or dispute it instead.',
      );
    }

    // The deal's total only covers what is still live, so drop the cancelled
    // amount from it. If nothing live is left the deal is cancelled too.
    const remaining = c.milestones.map((x) =>
      x.id === m.id ? { status: 'CANCELLED' as MilestoneStatus } : { status: x.status },
    );
    const nextStatus = recomputeContractStatus(remaining, c.accepted);

    await prisma.$transaction(async (tx) => {
      await tx.milestone.update({
        where: { id: m.id },
        data: { status: 'CANCELLED', autoReleaseAt: null, submittedAt: null },
      });
      await tx.contract.update({
        where: { id: c.id },
        data: {
          totalAmount: { decrement: Number(m.amount) },
          status: nextStatus,
          ...(nextStatus === 'CANCELLED'
            ? { cancelledAt: new Date(), cancellationReason: 'ALL_MILESTONES_CANCELLED' }
            : {}),
        },
      });
    });

    void NotificationService.notifyProjectEvent({
      contract: c,
      actorId: userId,
      event: 'milestone_cancelled',
      data: { milestoneTitle: m.title, amount: `${Number(m.amount)} ${c.currency}` },
    });
    if (nextStatus === 'CANCELLED') {
      void NotificationService.notifyProjectEvent({ contract: c, actorId: userId, event: 'project_cancelled' });
      void WhatsAppNotify.dealCancelledToInvitee(c.id);
    }
    return this.byId(userId, c.id);
  },

  /**
   * Let the creator fix the counterparty's name/email/phone - but only before
   * the project is confirmed (once they've joined, their identity is locked).
   * Re-resolves the linked account and re-sends the email invite if it changed.
   */
  async editCounterparty(userId: string, id: string, input: EditCounterpartyInput) {
    const creator = await prisma.user.findUnique({ where: { id: userId } });
    if (!creator) throw new AppError(404, 'Q-404', 'Account not found');
    const c = (await ContractRepository.getById(id)) as FullContract | null;
    if (!c) throw new AppError(404, 'Q-404', 'Project not found');
    if (c.creatorId !== userId) {
      throw new AppError(403, 'Q-403', 'Only the creator can edit the recipient.');
    }
    if (c.accepted) {
      throw new AppError(409, 'Q-409', "You can't change the recipient after they've confirmed the project.");
    }

    const name =
      input.counterpartyName !== undefined ? input.counterpartyName.trim() : c.counterpartyName;
    const phone =
      input.counterpartyPhone !== undefined
        ? normalizePhone(input.counterpartyPhone)
        : c.counterpartyPhone;

    if (!phone) {
      throw new AppError(409, 'Q-409', 'Add a phone number for the recipient.');
    }
    if (creator.phone && phone === creator.phone) {
      throw new AppError(409, 'Q-409', "You can't set yourself as the recipient.");
    }

    const match = await ContractRepository.findUserByPhone(phone);

    const updated = (await ContractRepository.updateCounterparty(id, {
      counterpartyName: name,
      counterpartyEmail: c.counterpartyEmail,
      counterpartyPhone: phone,
      counterpartyId: match?.id ?? null,
    })) as FullContract;

    // Re-send the SMS invite when the phone number changed.
    if (phone !== c.counterpartyPhone) {
      void sendDealInviteSms({
        to: phone,
        inviterName: creator.fullName,
        dealTitle: c.title,
        hasAccount: !!match,
      }).catch((e) => console.error('[sms] invite failed:', (e as Error).message));
    }

    const names = await nameMap([updated]);
    return shape(updated, userId, names);
  },

  /** Payee submits a deliverable → starts the inspection-period countdown. */
  async submitWork(userId: string, milestoneId: string, input: SubmitWorkInput) {
    const m = await loadMilestone(milestoneId);
    const c = m.contract;
    const { payeeId } = resolveParties(c);
    if (userId !== payeeId) {
      throw new AppError(403, 'Q-403', 'Only the party getting paid can submit work.');
    }
    if (m.status !== 'FUNDED' && m.status !== 'ACTIVE') {
      throw new AppError(409, 'Q-409', 'This milestone must be funded before you can submit work.');
    }

    // Upload any attached images to Cloudinary, then keep their file ids
    // alongside any pre-uploaded ids the client passed.
    const uploadedIds = input.images?.length
      ? await FileService.storeImages(userId, input.images, 'deliverable')
      : [];
    const fileIds = [...(input.fileIds ?? []), ...uploadedIds];

    const autoReleaseAt = new Date(Date.now() + m.inspectionDays * DAY_MS);
    await prisma.$transaction(async (tx) => {
      await tx.milestone.update({
        where: { id: m.id },
        data: { status: 'SUBMITTED', submittedAt: new Date(), autoReleaseAt },
      });
      await tx.milestoneSubmission.create({
        data: {
          milestoneId: m.id,
          submittedById: userId,
          note: input.note,
          fileIds,
        },
      });
      const milestones = c.milestones.map((x) =>
        x.id === m.id ? { status: 'SUBMITTED' as MilestoneStatus } : { status: x.status },
      );
      await tx.contract.update({
        where: { id: c.id },
        data: { status: recomputeContractStatus(milestones, c.accepted) },
      });
    });
    void NotificationService.notifyProjectEvent({
      contract: c,
      actorId: userId,
      event: 'submitted',
      data: { milestoneTitle: m.title },
    });
    return this.byId(userId, c.id);
  },

  /** Payer asks for changes during the inspection period (FR-PAY-006). */
  async requestRevision(userId: string, milestoneId: string, input: RevisionInput) {
    const m = await loadMilestone(milestoneId);
    const c = m.contract;
    const { payerId } = resolveParties(c);
    if (userId !== payerId) {
      throw new AppError(403, 'Q-403', 'Only the paying party can request a revision.');
    }
    if (m.status !== 'SUBMITTED') {
      throw new AppError(409, 'Q-409', 'You can only request a revision on submitted work.');
    }
    if (m.revisionCount >= m.maxRevisions) {
      throw new AppError(409, 'Q-409', `No revisions left (max ${m.maxRevisions}). Approve or open a dispute.`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.milestone.update({
        where: { id: m.id },
        data: {
          status: 'ACTIVE',
          revisionCount: { increment: 1 },
          submittedAt: null,
          autoReleaseAt: null,
        },
      });
      await tx.revisionRequest.create({
        data: { milestoneId: m.id, requestedById: userId, feedback: input.feedback },
      });
      const milestones = c.milestones.map((x) =>
        x.id === m.id ? { status: 'ACTIVE' as MilestoneStatus } : { status: x.status },
      );
      await tx.contract.update({
        where: { id: c.id },
        data: { status: recomputeContractStatus(milestones, c.accepted) },
      });
    });
    void NotificationService.notifyProjectEvent({
      contract: c,
      actorId: userId,
      event: 'revision',
      data: { milestoneTitle: m.title },
    });
    return this.byId(userId, c.id);
  },

  /** Add a milestone to an existing project (before it's completed). */
  async addMilestone(userId: string, contractId: string, input: AddMilestoneInput) {
    const c = (await ContractRepository.getById(contractId)) as FullContract | null;
    if (!c) throw new AppError(404, 'Q-404', 'Project not found');
    if (c.creatorId !== userId && c.counterpartyId !== userId) {
      throw new AppError(403, 'Q-403', 'This project was not shared with you.');
    }
    if (c.status === 'COMPLETED' || c.status === 'CANCELLED') {
      throw new AppError(409, 'Q-409', 'This project is closed.');
    }

    const nextOrder = c.milestones.reduce((max, m) => Math.max(max, m.order), -1) + 1;
    await prisma.$transaction(async (tx) => {
      await tx.milestone.create({
        data: {
          contractId: c.id,
          order: nextOrder,
          title: input.title,
          description: input.description,
          amount: input.amount,
          currency: c.currency,
          inspectionDays: c.inspectionDays,
          status: 'PENDING',
          deadline:
            input.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) ? new Date(input.dueDate) : null,
        },
      });
      await tx.contract.update({
        where: { id: c.id },
        data: { totalAmount: { increment: input.amount } },
      });
    });
    void NotificationService.notifyProjectEvent({
      contract: c,
      actorId: userId,
      event: 'milestone_added',
      data: { milestoneTitle: input.title, amount: `${input.amount} ${c.currency}` },
    });
    return this.byId(userId, c.id);
  },

  /**
   * Edit an unfunded milestone (title / description / amount / due date). Only a
   * PENDING milestone can be edited - once funded, the terms are locked. If the
   * amount changes, the project total moves by the same delta.
   */
  async editMilestone(userId: string, milestoneId: string, input: EditMilestoneInput) {
    const m = await loadMilestone(milestoneId);
    const c = m.contract;
    if (c.creatorId !== userId && c.counterpartyId !== userId) {
      throw new AppError(403, 'Q-403', 'This project was not shared with you.');
    }
    if (c.status === 'COMPLETED' || c.status === 'CANCELLED') {
      throw new AppError(409, 'Q-409', 'This project is closed.');
    }
    if (m.status === 'CANCELLED') {
      throw new AppError(409, 'Q-409', 'This milestone was cancelled.');
    }
    if (m.status !== 'PENDING') {
      throw new AppError(409, 'Q-409', 'Only an unfunded milestone can be edited.');
    }

    const delta = input.amount !== undefined ? round2(input.amount - Number(m.amount)) : 0;

    await prisma.$transaction(async (tx) => {
      await tx.milestone.update({
        where: { id: m.id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.amount !== undefined ? { amount: input.amount } : {}),
          ...(input.dueDate !== undefined
            ? {
                deadline:
                  input.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)
                    ? new Date(input.dueDate)
                    : null,
              }
            : {}),
        },
      });
      if (delta !== 0) {
        await tx.contract.update({
          where: { id: c.id },
          data: { totalAmount: { increment: delta } },
        });
      }
    });
    void NotificationService.notifyProjectEvent({
      contract: c,
      actorId: userId,
      event: 'milestone_edited',
      data: { milestoneTitle: input.title ?? m.title },
    });
    return this.byId(userId, c.id);
  },

  /**
   * Delete an unfunded milestone. Only a PENDING milestone can be removed (once
   * money is in escrow it must be released, refunded or disputed instead), and a
   * project must always keep at least one milestone. The project total is
   * reduced by the removed amount.
   */
  async deleteMilestone(userId: string, milestoneId: string) {
    const m = await loadMilestone(milestoneId);
    const c = m.contract;
    if (c.creatorId !== userId && c.counterpartyId !== userId) {
      throw new AppError(403, 'Q-403', 'This project was not shared with you.');
    }
    if (c.status === 'COMPLETED' || c.status === 'CANCELLED') {
      throw new AppError(409, 'Q-409', 'This project is closed.');
    }
    if (m.status === 'CANCELLED') {
      throw new AppError(409, 'Q-409', 'This milestone was cancelled.');
    }
    if (m.status !== 'PENDING') {
      throw new AppError(
        409,
        'Q-409',
        'Only an unfunded milestone can be deleted. Release, refund or dispute funded work instead.',
      );
    }
    if (c.milestones.filter(isLiveMilestone).length <= 1) {
      throw new AppError(409, 'Q-409', 'A project must keep at least one milestone.');
    }

    const remaining = c.milestones
      .filter((x) => x.id !== m.id)
      .map((x) => ({ status: x.status }));

    await prisma.$transaction(async (tx) => {
      // A PENDING milestone has no submissions/revisions/deliverables, but clean
      // up defensively so the delete can never hit a dangling reference.
      await tx.milestoneSubmission.deleteMany({ where: { milestoneId: m.id } });
      await tx.revisionRequest.deleteMany({ where: { milestoneId: m.id } });
      await tx.deliverable.deleteMany({ where: { milestoneId: m.id } });
      await tx.milestone.delete({ where: { id: m.id } });
      await tx.contract.update({
        where: { id: c.id },
        data: {
          totalAmount: { decrement: Number(m.amount) },
          status: recomputeContractStatus(remaining, c.accepted),
        },
      });
    });
    void NotificationService.notifyProjectEvent({
      contract: c,
      actorId: userId,
      event: 'milestone_deleted',
      data: { milestoneTitle: m.title },
    });
    return this.byId(userId, c.id);
  },

  /**
   * Permanently delete a project. Only allowed when no money has ever been
   * deposited - i.e. there is no escrow account and every milestone is still
   * PENDING. Once funds are in escrow the project can be CANCELLED (refund) but
   * never deleted, so the financial record is preserved.
   */
  async deleteProject(userId: string, contractId: string) {
    const c = (await ContractRepository.getById(contractId)) as FullContract | null;
    if (!c) throw new AppError(404, 'Q-404', 'Project not found');
    if (c.creatorId !== userId && c.counterpartyId !== userId) {
      throw new AppError(403, 'Q-403', 'This project was not shared with you.');
    }

    const account = await prisma.escrowAccount.findUnique({ where: { contractId: c.id } });
    if (account || hasMoneyMoved(c)) {
      throw new AppError(
        409,
        'Q-409',
        "You can't delete a project once money has been deposited. Cancel it instead.",
      );
    }

    void NotificationService.notifyProjectEvent({ contract: c, actorId: userId, event: 'project_deleted' });
    // Milestones cascade with the contract; PENDING milestones have no children.
    await prisma.contract.delete({ where: { id: c.id } });
    return { deleted: true, id: c.id };
  },

  /**
   * Creator marks the whole project completed → it becomes COMPLETED and locks
   * (no more milestones, edits, funding or actions). Blocked while any milestone
   * still holds escrow (release, refund or resolve those first).
   */
  async completeProject(userId: string, contractId: string) {
    const c = (await ContractRepository.getById(contractId)) as FullContract | null;
    if (!c) throw new AppError(404, 'Q-404', 'Project not found');
    if (c.creatorId !== userId) {
      throw new AppError(403, 'Q-403', 'Only the creator can mark the project completed.');
    }
    if (c.status === 'COMPLETED') throw new AppError(409, 'Q-409', 'This project is already completed.');
    if (c.status === 'CANCELLED') throw new AppError(409, 'Q-409', 'This project is cancelled.');

    const heldStates: MilestoneStatus[] = ['FUNDED', 'ACTIVE', 'SUBMITTED', 'DISPUTED'];
    // (A cancelled milestone holds nothing, so it never blocks completion.)
    if (c.milestones.some((m) => heldStates.includes(m.status))) {
      throw new AppError(
        409,
        'Q-409',
        'Release, refund or resolve every funded milestone before completing the project.',
      );
    }

    await prisma.contract.update({
      where: { id: c.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    void NotificationService.notifyProjectEvent({ contract: c, actorId: userId, event: 'project_completed' });
    return this.byId(userId, c.id);
  },
};
