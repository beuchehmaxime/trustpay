import { KycRecord, KycDocument, KycStatus, User } from '@prisma/client';

import { AuthRepository } from '../auth/auth.repository';
import { FileService } from '../file/file.service';
import { decryptField, encryptField, maskIdNumber } from '../lib/crypto';
import { emitAdminEvent } from '../lib/admin-events';
import { isCountryEnabled, isKycProviderEnabled, systemSettings } from '../lib/system-settings';
import { AppError } from '../lib/errors';
import { tierAfterEarning } from '../lib/kyc-gate';
import { verifyIdentity } from '../lib/kyc-provider';
import {
  sendComplianceAlert,
  sendKycStatus,
} from '../lib/notify';
import { screen } from '../lib/sanctions';
import { AmlRepository } from '../aml/aml.repository';
import { ACTIVE_KYC_STATUSES, KycRepository } from './kyc.repository';
import { SubmitKycInput } from './kyc.validation';
import { WhatsAppNotify } from '../whatsapp/whatsapp-notify';

type RecordWithDocs = KycRecord & { documents: KycDocument[] };

const STATUS_LABEL: Record<KycStatus, string> = {
  NOT_STARTED: 'Not started',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Verified',
  REJECTED: 'Rejected',
};

/** Human-readable summary of what a given KYC tier unlocks (SRS FR-KYC-001). */
const TIER_LABEL: Record<number, string> = {
  0: 'Unverified',
  1: 'Basic',
  2: 'Verified',
  3: 'Enhanced',
};

/** Shape the client renders for the verification screen. */
function statusDto(record: RecordWithDocs | null, user: User) {
  const status = record?.status ?? 'NOT_STARTED';
  return {
    tier: user.kycTier,
    tierLabel: TIER_LABEL[user.kycTier] ?? `Tier ${user.kycTier}`,
    accountStatus: user.status,
    status,
    statusLabel: STATUS_LABEL[status],
    canResubmit: !record || status === 'REJECTED',
    idType: record?.idType ?? null,
    idNumberMasked: record?.idNumber ? maskIdNumber(decryptField(record.idNumber)) : null,
    selfieScore: record?.selfieScore ? Number(record.selfieScore) : null,
    matchScore: record?.matchScore ? Number(record.matchScore) : null,
    rejectionReason: record?.rejectionReason ?? null,
    provider: record?.provider ?? null,
    submittedAt: record?.createdAt ?? null,
    reviewedAt: record?.reviewedAt ?? null,
    documents: (record?.documents ?? []).map((d) => ({ type: d.type, fileId: d.fileId })),
  };
}

/** The failed findings, as one line a reviewer can act on. */
function summariseChecks(checks?: { label: string; passed: boolean; detail: string }[]): string | null {
  if (!checks?.length) return null;
  const failures = checks.filter((check) => !check.passed);
  if (!failures.length) return null;
  return `Image analysis flagged: ${failures.map((check) => check.detail).join(' ')}`;
}

export const KycService = {
  /** Current verification state for the signed-in user. */
  async status(userId: string) {
    const user = await AuthRepository.findUserById(userId);
    if (!user) throw new AppError(404, 'Q-404', 'Account not found');
    const record = (await KycRepository.getLatestForUser(userId)) as RecordWithDocs | null;
    return statusDto(record, user);
  },

  /**
   * Submit identity documents for Tier-2 verification (SRS FR-KYC-002/003/006).
   *
   * Flow: store documents → AML screen (freeze on a sanctions hit) → run the
   * provider's ID + liveness check → auto-approve when all scores clear the
   * thresholds, otherwise route to the manual review queue. The user is always
   * notified of the resulting status (FR-KYC-005).
   */
  async submit(userId: string, input: SubmitKycInput) {
    const user = await AuthRepository.findUserById(userId);
    if (!user) throw new AppError(404, 'Q-404', 'Account not found');

    const verification = systemSettings().verification;

    if (user.kycTier >= verification.standardTier) {
      throw new AppError(409, 'Q-409', 'Your account is already verified.');
    }

    // Only accept verifications from markets that are currently open.
    if (!isCountryEnabled(input.country)) {
      throw new AppError(403, 'Q-403', 'BiZik is not available in your country yet.');
    }

    const latest = await KycRepository.getLatestForUser(userId);
    if (latest && ACTIVE_KYC_STATUSES.includes(latest.status)) {
      throw new AppError(
        409,
        'Q-409',
        'A verification is already in progress. Please wait for the result.',
      );
    }

    // 1) Persist documents as objects (encrypted-at-rest in prod, NFR-SEC-002).
    const front = await FileService.storeImage(userId, input.documents.idFront, 'kyc');
    const selfie = await FileService.storeImage(userId, input.documents.selfie, 'kyc');
    const back = input.documents.idBack
      ? await FileService.storeImage(userId, input.documents.idBack, 'kyc')
      : null;

    // 2) AML / sanctions screening (FR-KYC-006) - can be disabled in settings.
    let screening: { provider: string; result: 'CLEAR' | 'MATCH' | 'PEP'; matchData?: unknown };
    if (verification.sanctionsScreeningEnabled) {
      screening = await screen({ userId, fullName: user.fullName, country: input.country });
      await KycRepository.recordScreening({
        userId,
        provider: screening.provider,
        result: screening.result,
        matchData: screening.matchData as object,
      });
    } else {
      screening = { provider: 'screening_disabled', result: 'CLEAR', matchData: null };
    }

    // 3) Create the record + attach documents. Provider is chosen by region but
    // respects which identity providers are currently enabled in settings.
    const isAfricanMarket =
      !!input.country &&
      /Nigeria|Ghana|Cameroon|Chad|Gabon|Central African|Equatorial|Senegal|Kenya|Ivoire/i.test(
        input.country,
      );
    const provider =
      isAfricanMarket && isKycProviderEnabled('smile_identity')
        ? 'smile_identity'
        : isKycProviderEnabled('stripe_identity')
          ? 'stripe_identity'
          : isKycProviderEnabled('smile_identity')
            ? 'smile_identity'
            : 'stripe_identity';
    const record = await KycRepository.createRecord({
      userId,
      tier: verification.standardTier,
      idType: input.idType,
      idNumber: encryptField(input.idNumber),
      provider,
      status: 'SUBMITTED',
    });
    await KycRepository.addDocuments([
      { kycRecordId: record.id, type: 'ID_FRONT', fileId: front.id },
      ...(back ? [{ kycRecordId: record.id, type: 'ID_BACK' as const, fileId: back.id }] : []),
      { kycRecordId: record.id, type: 'SELFIE', fileId: selfie.id },
    ]);

    // Save the country so the profile is complete. The PHONE is deliberately
    // NOT taken from this request: phone number is how BiZik identifies people
    // and routes money (deal invitations, transfers by number), so accepting it
    // here - and marking it verified - would have let anyone claim someone
    // else's number and step into deals invited to it. Changing the number goes
    // through the OTP flow, which is what proves it.
    await AuthRepository.updateUser(userId, { country: input.country });

    // Notify the KYC review team that a new submission is in the queue.
    void emitAdminEvent({
      type: 'KYC_SUBMITTED',
      severity: 'INFO',
      title: 'New KYC submission',
      body: `${user.fullName} submitted identity verification for review.`,
      permission: 'kyc.view',
      entityType: 'KycRecord',
      entityId: record.id,
      link: `/kyc/${record.id}`,
      actorId: userId,
    });

    // A sanctions/PEP hit forces manual review, and - when auto-freeze is on -
    // freezes the account pending compliance review.
    if (screening.result !== 'CLEAR') {
      if (verification.amlAutoFreeze) {
        await AuthRepository.updateUser(userId, { status: 'FROZEN' });
      }
      await KycRepository.updateRecord(record.id, {
        status: 'UNDER_REVIEW',
        providerRef: null,
      });
      await KycRepository.createReviewItem({
        kycRecordId: record.id,
        reason: `AML screening returned ${screening.result}`,
      });
      // Open an AML case for the compliance team to work (SRS MOD-10).
      const alert = await AmlRepository.createAlert({
        userId,
        type: screening.result === 'MATCH' ? 'SANCTIONS_MATCH' : 'PEP_MATCH',
        status: 'NEW',
        details: screening.matchData as object,
      });
      // Page the compliance team via the operator inbox (a critical alert).
      void emitAdminEvent({
        type: screening.result === 'MATCH' ? 'SANCTIONS_MATCH' : 'AML_ALERT',
        severity: 'CRITICAL',
        title:
          screening.result === 'MATCH'
            ? verification.amlAutoFreeze
              ? 'Sanctions match - account frozen'
              : 'Sanctions match flagged'
            : 'PEP match flagged',
        body: `${user.fullName} triggered a ${screening.result} screening result.${
          verification.amlAutoFreeze
            ? ' The account was frozen automatically pending review.'
            : ' The account was flagged for review (auto-freeze is disabled).'
        }`,
        permission: 'aml.view',
        entityType: 'AmlAlert',
        entityId: alert.id,
        link: `/aml/${alert.id}`,
        actorId: userId,
      });
      void sendComplianceAlert({ userId, fullName: user.fullName, result: screening.result });
      void sendKycStatus({
        to: user.email,
        fullName: user.fullName,
        status: 'UNDER_REVIEW',
      });
      return this.status(userId);
    }

    // 4) Provider ID + liveness verification (FR-KYC-002/003).
    const result = await verifyIdentity({
      idType: input.idType,
      idNumber: input.idNumber,
      country: input.country,
      fullName: user.fullName,
      // The submitted images themselves - this is what makes the scores real.
      documents: {
        idFront: input.documents.idFront,
        selfie: input.documents.selfie,
        ...(input.documents.idBack ? { idBack: input.documents.idBack } : {}),
      },
    });

    const thresholds = verification.kycThresholds;
    const passes =
      result.confidence >= thresholds.confidence &&
      result.selfieScore >= thresholds.selfie &&
      result.matchScore >= thresholds.match;

    await KycRepository.updateRecord(record.id, {
      provider: result.provider,
      providerRef: result.providerRef,
      providerSimulated: result.simulated,
      selfieScore: result.selfieScore,
      matchScore: result.matchScore,
      documentScore: result.confidence,
      // Every finding, in the reviewer's words rather than as a bare number.
      providerChecks: result.checks ? (result.checks as object) : undefined,
      providerAdvice: result.recommendation ? (result.recommendation as object) : undefined,
    });

    // ---- Fully automated approval ----
    // Off by default, and it should stay off while the provider is the built-in
    // stand-in rather than a real identity service: `providerSimulated` means
    // nobody actually checked the documents, so approving on those scores is
    // approving on nothing. Guarding it here rather than trusting the setting
    // means switching the setting on cannot, by itself, start rubber-stamping
    // simulated results.
    //
    // It is also a decision with legal weight wherever GDPR applies: identity
    // verification carries legal or similarly significant effect, so a purely
    // automated approval engages Art. 22 and the right to human review. Cameroon
    // is the only open market today, so that does not bite yet - but the guard
    // is cheap and the market list is designed to change.
    if (passes && verification.autoApproveOnPass && result.simulated) {
      console.warn(
        '[kyc] auto-approval is enabled but the provider is SIMULATED - ' +
          `record ${record.id} is going to a human instead. Nobody has checked these documents.`,
      );
    }
    if (passes && verification.autoApproveOnPass && !result.simulated) {
      // Auto-approve and advance the tier (INT-KYC-004). Off by default - see
      // VerificationSettings.autoApproveOnPass.
      await KycRepository.updateRecord(record.id, {
        status: 'APPROVED',
        reviewedAt: new Date(),
      });
      await AuthRepository.updateUser(userId, {
        // Raised, not assigned - see tierAfterEarning. Approving a submission
        // must never cost someone a tier they already hold.
        kycTier: tierAfterEarning(user.kycTier, verification.standardTier),
        freelancerEnabled: true,
        status: 'ACTIVE',
      });
      void sendKycStatus({ to: user.email, fullName: user.fullName, status: 'APPROVED' });
      void WhatsAppNotify.kycStatus(userId, 'APPROVED');
    } else if (passes) {
      // The normal path: the provider's scores are EVIDENCE for a reviewer, not
      // a decision. The submission waits in the queue, the tier is untouched,
      // and the "you're verified" message is sent only when a human approves.
      await KycRepository.updateRecord(record.id, { status: 'UNDER_REVIEW' });
      await KycRepository.createReviewItem({
        kycRecordId: record.id,
        reason: result.simulated
          ? 'No image analysis is connected - the scores on this record are placeholders and NOT a check of the documents. Review the images yourself.'
          : summariseChecks(result.checks) ??
            `Image analysis passed (document ${result.confidence.toFixed(2)}, selfie ${result.selfieScore.toFixed(2)}, face match ${result.matchScore.toFixed(2)}) - awaiting approval.`,
      });
      void sendKycStatus({ to: user.email, fullName: user.fullName, status: 'UNDER_REVIEW' });
    } else if (verification.manualReviewOnLowConfidence) {
      // Low confidence / failed liveness → human review (INT-KYC-004).
      await KycRepository.updateRecord(record.id, { status: 'UNDER_REVIEW' });
      await KycRepository.createReviewItem({
        kycRecordId: record.id,
        reason: `Confidence ${result.confidence}, liveness ${result.selfieScore}, match ${result.matchScore} below threshold`,
      });
      void sendKycStatus({ to: user.email, fullName: user.fullName, status: 'UNDER_REVIEW' });
    } else {
      // Manual review disabled → auto-reject below-threshold submissions.
      await KycRepository.updateRecord(record.id, {
        status: 'REJECTED',
        reviewedAt: new Date(),
        rejectionReason: 'Automated verification scores were below the required threshold.',
      });
      void sendKycStatus({
        to: user.email,
        fullName: user.fullName,
        status: 'REJECTED',
        reason: 'Automated verification did not meet the required confidence.',
      });
    }

    return this.status(userId);
  },
};
