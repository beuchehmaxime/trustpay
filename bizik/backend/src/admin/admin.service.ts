import { KycDocument, KycRecord, KycStatus, ManualReviewItem } from '@prisma/client';

import { config } from '../config/env';
import { AuthRepository } from '../auth/auth.repository';
import { KycRepository } from '../kyc/kyc.repository';
import { decryptField, maskIdNumber } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { tierAfterEarning } from '../lib/kyc-gate';
import { sendKycStatus } from '../lib/notify';
import { WhatsAppNotify } from '../whatsapp/whatsapp-notify';

type FullRecord = KycRecord & {
  documents: KycDocument[];
  reviewItems: ManualReviewItem[];
};

type QueueUser = {
  id: string;
  fullName: string;
  email: string;
  country: string | null;
  role: string;
  kycTier: number;
};

const STATUS_LABEL: Record<KycStatus, string> = {
  NOT_STARTED: 'Not started',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Verified',
  REJECTED: 'Rejected',
};

/** Compliance-facing view of a KYC submission (SRS MOD-09, FR-ADM-001). */
function reviewDto(record: FullRecord, user?: QueueUser) {
  return {
    id: record.id,
    userId: record.userId,
    status: record.status,
    statusLabel: STATUS_LABEL[record.status],
    targetTier: record.tier,
    user: user
      ? {
          fullName: user.fullName,
          email: user.email,
          country: user.country,
          role: user.role.toLowerCase(),
          currentTier: user.kycTier,
        }
      : null,
    idType: record.idType,
    idNumber: record.idNumber ? maskIdNumber(decryptField(record.idNumber)) : null,
    selfieScore: record.selfieScore ? Number(record.selfieScore) : null,
    matchScore: record.matchScore ? Number(record.matchScore) : null,
    documentScore: record.documentScore ? Number(record.documentScore) : null,
    provider: record.provider,
    providerRef: record.providerRef,
    /** Scores came from the stand-in, not a real provider - the UI must say so. */
    providerSimulated: record.providerSimulated,
    /** Per-check findings from the image analysis, for the reviewer to read. */
    providerChecks: record.providerChecks ?? null,
    /** Advisory triage suggestion - speeds the reviewer up, decides nothing. */
    providerAdvice: record.providerAdvice ?? null,
    rejectionReason: record.rejectionReason,
    reviewItems: record.reviewItems.map((reviewItem) => ({
      reason: reviewItem.reason,
      resolved: reviewItem.resolved,
      createdAt: reviewItem.createdAt,
    })),
    documents: record.documents.map((document) => ({
      type: document.type,
      fileId: document.fileId,
    })),
    submittedAt: record.createdAt,
    reviewedAt: record.reviewedAt,
  };
}

/** Optional filters for the KYC review queue. */
export interface KycQueueFilters {
  status?: KycStatus;
  search?: string;
  country?: string;
  idType?: string;
}

async function detail(id: string) {
  const record = (await KycRepository.getRecordById(id)) as FullRecord | null;
  if (!record) throw new AppError(404, 'Q-404', 'KYC submission not found');
  const [user] = (await KycRepository.getUsersByIds([record.userId])) as QueueUser[];
  return reviewDto(record, user);
}

export const AdminService = {
  /** Pending submissions, oldest first, narrowed by the given filters. */
  async kycQueue(filters: KycQueueFilters = {}) {
    const records = (await KycRepository.queue(
      filters.status ? { status: filters.status } : {},
    )) as FullRecord[];
    const userIds = [...new Set(records.map((record) => record.userId))];
    const users = (await KycRepository.getUsersByIds(userIds)) as QueueUser[];
    const usersById = new Map(users.map((user) => [user.id, user]));

    let items = records.map((record) => reviewDto(record, usersById.get(record.userId)));

    if (filters.country) {
      items = items.filter((item) => item.user?.country === filters.country);
    }
    if (filters.idType) {
      items = items.filter((item) => item.idType === filters.idType);
    }
    if (filters.search) {
      const needle = filters.search.trim().toLowerCase();
      items = items.filter((item) => {
        const haystack = `${item.user?.fullName ?? ''} ${item.user?.email ?? ''}`.toLowerCase();
        return haystack.includes(needle);
      });
    }
    return items;
  },

  kycDetail(id: string) {
    return detail(id);
  },

  /** Approve a submission → advance the user to the standard tier. */
  async approve(adminId: string, id: string) {
    const record = await KycRepository.getRecordById(id);
    if (!record) throw new AppError(404, 'Q-404', 'KYC submission not found');

    await KycRepository.updateRecord(id, {
      status: 'APPROVED',
      reviewedById: adminId,
      reviewedAt: new Date(),
      rejectionReason: null,
    });
    await KycRepository.resolveReviewItems(id);
    const holder = await AuthRepository.findUserById(record.userId);
    await AuthRepository.updateUser(record.userId, {
      // Tier 2 (Verified) is what approved identity documents earn. Raised, not
      // assigned, so approving a submission from someone already above it does
      // not quietly take their higher tier away.
      kycTier: tierAfterEarning(holder?.kycTier ?? 0, config.kyc.standardTier),
      freelancerEnabled: true,
      status: 'ACTIVE',
    });

    const [user] = await KycRepository.getUsersByIds([record.userId]);
    if (user) {
      void sendKycStatus({ to: user.email, fullName: user.fullName, status: 'APPROVED' });
    }
    void WhatsAppNotify.kycStatus(record.userId, 'APPROVED');
    return detail(id);
  },

  /** Reject a submission with a reason; the user may resubmit. */
  async reject(adminId: string, id: string, reason: string) {
    const record = await KycRepository.getRecordById(id);
    if (!record) throw new AppError(404, 'Q-404', 'KYC submission not found');

    await KycRepository.updateRecord(id, {
      status: 'REJECTED',
      reviewedById: adminId,
      reviewedAt: new Date(),
      rejectionReason: reason,
    });
    await KycRepository.resolveReviewItems(id);

    const [user] = await KycRepository.getUsersByIds([record.userId]);
    if (user) {
      void sendKycStatus({ to: user.email, fullName: user.fullName, status: 'REJECTED', reason });
    }
    void WhatsAppNotify.kycStatus(record.userId, 'REJECTED', reason);
    return detail(id);
  },

  /**
   * Ask the user for additional/clearer documents. Modelled as a rejection
   * with a doc-request reason so the user is unblocked to resubmit.
   */
  async requestDocuments(adminId: string, id: string, message: string) {
    return this.reject(adminId, id, `More documents needed: ${message}`);
  },

  /** Escalate a borderline/high-risk case to a Compliance Officer. */
  async escalate(adminId: string, id: string) {
    const record = await KycRepository.getRecordById(id);
    if (!record) throw new AppError(404, 'Q-404', 'KYC submission not found');
    await KycRepository.updateRecord(id, {
      status: 'UNDER_REVIEW',
      reviewedById: adminId,
    });
    await KycRepository.createReviewItem({
      kycRecordId: id,
      reason: 'Escalated to Compliance Officer',
    });
    return detail(id);
  },
};
