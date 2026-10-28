-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('FREELANCER', 'CLIENT', 'AGENCY', 'ADMIN', 'COMPLIANCE', 'MEDIATOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'FROZEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'EUR', 'GBP', 'NGN', 'GHS', 'XAF');

-- CreateEnum
CREATE TYPE "TwoFactorMethodType" AS ENUM ('TOTP', 'SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE', 'LINKEDIN');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "KycIdType" AS ENUM ('NATIONAL_ID', 'PASSPORT', 'DRIVERS_LICENSE', 'VOTERS_CARD');

-- CreateEnum
CREATE TYPE "KycDocumentType" AS ENUM ('ID_FRONT', 'ID_BACK', 'SELFIE', 'ADDRESS_PROOF', 'BUSINESS_CERTIFICATE', 'DIRECTOR_ID');

-- CreateEnum
CREATE TYPE "ScreeningResult" AS ENUM ('CLEAR', 'MATCH', 'PEP');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'INVITED', 'UNDER_REVIEW', 'SIGNED', 'FUNDED', 'IN_PROGRESS', 'IN_REVIEW', 'DISPUTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PENDING', 'FUNDED', 'ACTIVE', 'SUBMITTED', 'APPROVED', 'RELEASED', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('SENT', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "SignatureRole" AS ENUM ('FREELANCER', 'CLIENT');

-- CreateEnum
CREATE TYPE "AmendmentStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EscrowAccountStatus" AS ENUM ('OPEN', 'PARTIALLY_RELEASED', 'RELEASED', 'REFUNDED', 'FROZEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "EscrowTxType" AS ENUM ('FUND', 'HOLD', 'RELEASE', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TxStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "PaymentGateway" AS ENUM ('STRIPE', 'PAYSTACK', 'FLUTTERWAVE', 'MTN_MOMO', 'ORANGE_MONEY', 'PAYONEER', 'WISE', 'PAYPAL', 'BANK_TRANSFER', 'ACH', 'INTERNAL');

-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('REQUIRES_PAYMENT', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('INITIATED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('CLIENT_SERVICE_FEE', 'FREELANCER_FEE', 'EXPRESS_WITHDRAWAL', 'FX_MARGIN', 'DISPUTE_FEE');

-- CreateEnum
CREATE TYPE "WalletStatus" AS ENUM ('ACTIVE', 'FROZEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "WalletTxType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'ESCROW_HOLD', 'FEE', 'REFUND', 'FX_IN', 'FX_OUT', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PayoutMethodType" AS ENUM ('MTN_MOMO', 'ORANGE_MONEY', 'PAYONEER', 'BANK');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('INITIATED', 'PROCESSING', 'ON_HOLD', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('FILED', 'AWAITING_RESPONSE', 'UNDER_REVIEW', 'ESCALATED', 'RESOLVED', 'AUTO_RULED');

-- CreateEnum
CREATE TYPE "DisputeReason" AS ENUM ('NON_DELIVERY', 'INCOMPLETE_WORK', 'QUALITY_BELOW_SPEC', 'SCOPE_CREEP', 'COMMUNICATION_BREAKDOWN', 'OTHER');

-- CreateEnum
CREATE TYPE "DisputeRulingType" AS ENUM ('FULL_RELEASE', 'FULL_REFUND', 'PARTIAL_SPLIT');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('PAYMENT', 'CONTRACT', 'KYC', 'DISPUTE', 'SECURITY', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'PUSH', 'SMS');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateEnum
CREATE TYPE "BadgeType" AS ENUM ('VERIFIED', 'PRO', 'ELITE');

-- CreateEnum
CREATE TYPE "AmlAlertType" AS ENUM ('STRUCTURING', 'SANCTIONS_MATCH', 'HIGH_RISK_FLOW', 'VELOCITY_ANOMALY', 'PEP_MATCH');

-- CreateEnum
CREATE TYPE "AmlAlertStatus" AS ENUM ('NEW', 'UNDER_REVIEW', 'CLEARED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('DAILY_TRANSACTION_SUMMARY', 'MONTHLY_AML', 'KYC_COVERAGE', 'SUSPICIOUS_ACTIVITY', 'EARNINGS_TAX', 'GMV_ANALYTICS');

-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('PDF', 'CSV', 'XLSX');

-- CreateEnum
CREATE TYPE "FileScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED');

-- CreateEnum
CREATE TYPE "PaymentProviderName" AS ENUM ('MTN_MOBILE_MONEY', 'ORANGE_MONEY', 'BANK');

-- CreateEnum
CREATE TYPE "PaymentOperation" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "PaymentTransactionStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESSFUL', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "LegalDocType" AS ENUM ('TERMS', 'PRIVACY', 'AML_POLICY', 'COOKIE', 'ACCEPTABLE_USE', 'DISPUTE');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportCategory" AS ENUM ('PAYMENTS', 'KYC', 'DISPUTES', 'ACCOUNT', 'TECHNICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "SupportPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "SupportAuthorType" AS ENUM ('USER', 'STAFF');

-- CreateEnum
CREATE TYPE "MessageReportStatus" AS ENUM ('PENDING', 'REMOVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "MessageReportSource" AS ENUM ('RECIPIENT', 'CLASSIFIER');

-- CreateEnum
CREATE TYPE "AdminEventType" AS ENUM ('KYC_SUBMITTED', 'KYC_ESCALATED', 'AML_ALERT', 'SANCTIONS_MATCH', 'ACCOUNT_FROZEN', 'DISPUTE_FILED', 'DISPUTE_ESCALATED', 'PAYOUT_PENDING', 'ESCROW_ADJUSTED', 'OPERATOR_ADDED', 'ROLE_CHANGED', 'SETTINGS_CHANGED', 'REPORT_READY', 'BROADCAST_SENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AdminEventSeverity" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "WhatsAppDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "WhatsAppCampaignStatus" AS ENUM ('DRAFT', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WhatsAppRecipientStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED_OPTOUT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "passwordHash" TEXT,
    "fullName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'CLIENT',
    "country" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "kycTier" INTEGER NOT NULL DEFAULT 0,
    "freelancerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "companyName" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "adminRoleId" TEXT,
    "termsAcceptedAt" TIMESTAMP(3),
    "signupSource" TEXT,
    "signupIp" TEXT,
    "signupUserAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "device" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "rotatedFromId" TEXT,
    "sessionId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "2fa_methods" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "method" "TwoFactorMethodType" NOT NULL,
    "secret" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "2fa_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "ipAddress" TEXT,
    "successful" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_records" (
    "providerSimulated" BOOLEAN NOT NULL DEFAULT true,
    "providerChecks" JSONB,
    "providerAdvice" JSONB,
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "idType" "KycIdType",
    "idNumber" TEXT,
    "selfieScore" DECIMAL(4,3),
    "matchScore" DECIMAL(4,3),
    "documentScore" DECIMAL(4,3),
    "status" "KycStatus" NOT NULL DEFAULT 'SUBMITTED',
    "provider" TEXT,
    "providerRef" TEXT,
    "rejectionReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_documents" (
    "id" TEXT NOT NULL,
    "kycRecordId" TEXT NOT NULL,
    "type" "KycDocumentType" NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_review_queue" (
    "id" TEXT NOT NULL,
    "kycRecordId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "assignedToId" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "manual_review_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sanctions_screenings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'complyadvantage',
    "result" "ScreeningResult" NOT NULL,
    "matchData" JSONB,
    "screenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sanctions_screenings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "bio" TEXT,
    "country" TEXT NOT NULL,
    "avatarColor" TEXT,
    "bizikScore" INTEGER NOT NULL DEFAULT 0,
    "completedContracts" INTEGER NOT NULL DEFAULT 0,
    "disputeRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "avgRating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_skills" (
    "profileId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,

    CONSTRAINT "profile_skills_pkey" PRIMARY KEY ("profileId","skillId")
);

-- CreateTable
CREATE TABLE "portfolio_items" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "fileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badges" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "type" "BadgeType" NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "revieweeId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "visibleAt" TIMESTAMP(3),
    "reported" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_history" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "creatorId" TEXT NOT NULL,
    "counterpartyId" TEXT,
    "counterpartyName" TEXT,
    "counterpartyEmail" TEXT,
    "counterpartyPhone" TEXT,
    "creatorIsPayer" BOOLEAN NOT NULL DEFAULT false,
    "currency" "Currency" NOT NULL,
    "totalAmount" DECIMAL(20,4) NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'INVITED',
    "inspectionDays" INTEGER NOT NULL DEFAULT 5,
    "templateId" TEXT,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "signedByClientAt" TIMESTAMP(3),
    "signedByFreelancerAt" TIMESTAMP(3),
    "fundedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestones" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(20,4) NOT NULL,
    "currency" "Currency" NOT NULL,
    "deadline" TIMESTAMP(3),
    "inspectionDays" INTEGER NOT NULL DEFAULT 5,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "maxRevisions" INTEGER NOT NULL DEFAULT 3,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "autoReleaseAt" TIMESTAMP(3),
    "dueReminderSentAt" TIMESTAMP(3),

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliverables" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "fileId" TEXT,

    CONSTRAINT "deliverables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestone_submissions" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "note" TEXT,
    "fileIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "milestone_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revision_requests" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "feedback" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revision_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_signatures" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "SignatureRole" NOT NULL,
    "ipAddress" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amendments" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "proposedById" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "status" "AmendmentStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "amendments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amendment_signatures" (
    "id" TEXT NOT NULL,
    "amendmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "SignatureRole" NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amendment_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_templates" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_milestones" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amountPct" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "template_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_invitations" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'SENT',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow_accounts" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "subAccountRef" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "heldAmount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "releasedAmount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "refundedAmount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "status" "EscrowAccountStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escrow_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow_transactions" (
    "id" TEXT NOT NULL,
    "escrowAccountId" TEXT NOT NULL,
    "milestoneId" TEXT,
    "type" "EscrowTxType" NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "currency" "Currency" NOT NULL,
    "status" "TxStatus" NOT NULL DEFAULT 'PENDING',
    "gateway" "PaymentGateway",
    "gatewayRef" TEXT,
    "idempotencyKey" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "escrow_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_intents" (
    "id" TEXT NOT NULL,
    "contractId" TEXT,
    "milestoneId" TEXT,
    "payerId" TEXT,
    "gateway" "PaymentGateway" NOT NULL,
    "gatewayIntentId" TEXT,
    "amount" DECIMAL(20,4) NOT NULL,
    "currency" "Currency" NOT NULL,
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'REQUIRES_PAYMENT',
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_webhooks" (
    "id" TEXT NOT NULL,
    "gateway" "PaymentGateway" NOT NULL,
    "eventType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "currency" "Currency" NOT NULL,
    "note" TEXT,
    "senderReference" TEXT,
    "recipientReference" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "PaymentProviderName" NOT NULL,
    "operation" "PaymentOperation" NOT NULL,
    "status" "PaymentTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(20,4) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'XAF',
    "phoneNumber" TEXT,
    "transactionReference" TEXT NOT NULL,
    "providerReference" TEXT,
    "providerTransactionId" TEXT,
    "failureReason" TEXT,
    "providerResponse" JSONB,
    "heldForApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvalReviewedById" TEXT,
    "approvalReviewedAt" TIMESTAMP(3),
    "walletReference" TEXT,
    "purpose" TEXT,
    "purposeRefId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "escrowAccountId" TEXT NOT NULL,
    "transactionId" TEXT,
    "amount" DECIMAL(20,4) NOT NULL,
    "currency" "Currency" NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'INITIATED',
    "gateway" "PaymentGateway",
    "gatewayRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_records" (
    "id" TEXT NOT NULL,
    "escrowAccountId" TEXT,
    "contractId" TEXT,
    "payerId" TEXT,
    "type" "FeeType" NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "currency" "Currency" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "balance" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "pendingBalance" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "status" "WalletStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "reference" TEXT,
    "type" "WalletTxType" NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "currency" "Currency" NOT NULL,
    "balanceAfter" DECIMAL(20,4) NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_methods" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "PayoutMethodType" NOT NULL,
    "provider" TEXT,
    "accountName" TEXT,
    "accountDetail" TEXT NOT NULL,
    "currency" "Currency",
    "country" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "payout_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "payoutMethodId" TEXT NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "feeAmount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'INITIATED',
    "gateway" "PaymentGateway",
    "gatewayRef" TEXT,
    "failureReason" TEXT,
    "isExpress" BOOLEAN NOT NULL DEFAULT false,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "payout_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fx_conversions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromCurrency" "Currency" NOT NULL,
    "toCurrency" "Currency" NOT NULL,
    "fromAmount" DECIMAL(20,4) NOT NULL,
    "toAmount" DECIMAL(20,4) NOT NULL,
    "midMarketRate" DECIMAL(20,8) NOT NULL,
    "marginPct" DECIMAL(5,3) NOT NULL DEFAULT 0.5,
    "appliedRate" DECIMAL(20,8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fx_rates_log" (
    "id" TEXT NOT NULL,
    "baseCurrency" "Currency" NOT NULL,
    "quoteCurrency" "Currency" NOT NULL,
    "rate" DECIMAL(20,8) NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'open_exchange_rates',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_rates_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "clientServicePct" DECIMAL(6,5) NOT NULL,
    "freelancerFeePct" DECIMAL(6,5) NOT NULL,
    "expressWithdrawalPct" DECIMAL(6,5) NOT NULL,
    "fxMarginPct" DECIMAL(6,5) NOT NULL,
    "minWithdrawalUsd" DECIMAL(20,4) NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fx_rates" (
    "currency" "Currency" NOT NULL,
    "usdRate" DECIMAL(20,8) NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("currency")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "category" "SupportCategory" NOT NULL DEFAULT 'OTHER',
    "priority" "SupportPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "authorType" "SupportAuthorType" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_articles" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "phone" TEXT,
    "message" TEXT NOT NULL,
    "documents" JSONB NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "topic" TEXT,
    "message" TEXT NOT NULL,
    "handled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_posts" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'guides',
    "categoryLabel" TEXT NOT NULL DEFAULT 'Guides',
    "coverImage" TEXT,
    "author" TEXT,
    "readMinutes" INTEGER NOT NULL DEFAULT 4,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "lang" TEXT NOT NULL DEFAULT 'en',
    "translationKey" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_documents" (
    "id" TEXT NOT NULL,
    "type" "LegalDocType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "effectiveAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "filedById" TEXT NOT NULL,
    "reason" "DisputeReason" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'FILED',
    "responseDeadline" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_evidence" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "description" TEXT,
    "fileIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_responses" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "respondentId" TEXT NOT NULL,
    "rebuttal" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_messages" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_timeline" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_timeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mediator_assignments" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "mediatorId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recusedAt" TIMESTAMP(3),

    CONSTRAINT "mediator_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_rulings" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "ruling" "DisputeRulingType" NOT NULL,
    "freelancerPct" INTEGER NOT NULL DEFAULT 0,
    "clientPct" INTEGER NOT NULL DEFAULT 0,
    "rationale" TEXT NOT NULL,
    "ruledById" TEXT NOT NULL,
    "ruledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_rulings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_recommendations" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "recommendation" "DisputeRulingType" NOT NULL,
    "freelancerPct" INTEGER NOT NULL DEFAULT 50,
    "confidence" DECIMAL(4,3) NOT NULL,
    "rationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channels" "NotificationChannel"[],
    "entityType" TEXT,
    "entityId" TEXT,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_delivery_log" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "providerRef" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_delivery_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_threads" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_reports" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "reportedById" TEXT,
    "reason" TEXT NOT NULL,
    "source" "MessageReportSource" NOT NULL DEFAULT 'RECIPIENT',
    "status" "MessageReportStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "channels" "NotificationChannel"[],
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_attachments" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_notifications" (
    "id" TEXT NOT NULL,
    "type" "AdminEventType" NOT NULL,
    "severity" "AdminEventSeverity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "permission" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "link" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_notification_reads" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_notification_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "url" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "purpose" TEXT,
    "scanStatus" "FileScanStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aml_alerts" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "transactionRef" TEXT,
    "type" "AmlAlertType" NOT NULL,
    "status" "AmlAlertStatus" NOT NULL DEFAULT 'NEW',
    "assignedToId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "aml_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "result" TEXT NOT NULL DEFAULT 'SUCCESS',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "beforeState" JSONB,
    "afterState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "type" "ReportType" NOT NULL,
    "generatedById" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "format" "ReportFormat" NOT NULL DEFAULT 'PDF',
    "s3Key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_channels" (
    "lastInboundAt" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "optIn" BOOLEAN NOT NULL DEFAULT true,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "pinHash" TEXT,
    "pinFailures" INTEGER NOT NULL DEFAULT 0,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "userId" TEXT,
    "direction" "WhatsAppDirection" NOT NULL,
    "waMessageId" TEXT,
    "kind" TEXT NOT NULL,
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "variables" JSONB,
    "note" TEXT,
    "status" "WhatsAppCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "audienceSize" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT,
    "phone" TEXT NOT NULL,
    "status" "WhatsAppRecipientStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "waMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_country_idx" ON "users"("country");

-- CreateIndex
CREATE INDEX "users_adminRoleId_idx" ON "users"("adminRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "admin_roles_name_key" ON "admin_roles"("name");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_sessionId_idx" ON "refresh_tokens"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "2fa_methods_userId_method_key" ON "2fa_methods"("userId", "method");

-- CreateIndex
CREATE INDEX "backup_codes_userId_idx" ON "backup_codes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE INDEX "oauth_accounts_userId_idx" ON "oauth_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_provider_providerAccountId_key" ON "oauth_accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "login_attempts_email_idx" ON "login_attempts"("email");

-- CreateIndex
CREATE INDEX "login_attempts_userId_idx" ON "login_attempts"("userId");

-- CreateIndex
CREATE INDEX "kyc_records_userId_idx" ON "kyc_records"("userId");

-- CreateIndex
CREATE INDEX "kyc_records_status_idx" ON "kyc_records"("status");

-- CreateIndex
CREATE INDEX "kyc_documents_kycRecordId_idx" ON "kyc_documents"("kycRecordId");

-- CreateIndex
CREATE INDEX "manual_review_queue_kycRecordId_idx" ON "manual_review_queue"("kycRecordId");

-- CreateIndex
CREATE INDEX "sanctions_screenings_userId_idx" ON "sanctions_screenings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_userId_key" ON "profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_username_key" ON "profiles"("username");

-- CreateIndex
CREATE UNIQUE INDEX "skills_name_key" ON "skills"("name");

-- CreateIndex
CREATE INDEX "portfolio_items_profileId_idx" ON "portfolio_items"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "badges_profileId_type_key" ON "badges"("profileId", "type");

-- CreateIndex
CREATE INDEX "reviews_revieweeId_idx" ON "reviews"("revieweeId");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_contractId_reviewerId_key" ON "reviews"("contractId", "reviewerId");

-- CreateIndex
CREATE INDEX "score_history_profileId_idx" ON "score_history"("profileId");

-- CreateIndex
CREATE INDEX "contracts_creatorId_idx" ON "contracts"("creatorId");

-- CreateIndex
CREATE INDEX "contracts_counterpartyId_idx" ON "contracts"("counterpartyId");

-- CreateIndex
CREATE INDEX "contracts_counterpartyEmail_idx" ON "contracts"("counterpartyEmail");

-- CreateIndex
CREATE INDEX "contracts_counterpartyPhone_idx" ON "contracts"("counterpartyPhone");

-- CreateIndex
CREATE INDEX "contracts_status_idx" ON "contracts"("status");

-- CreateIndex
CREATE INDEX "milestones_contractId_idx" ON "milestones"("contractId");

-- CreateIndex
CREATE INDEX "milestones_status_idx" ON "milestones"("status");

-- CreateIndex
CREATE INDEX "deliverables_milestoneId_idx" ON "deliverables"("milestoneId");

-- CreateIndex
CREATE INDEX "milestone_submissions_milestoneId_idx" ON "milestone_submissions"("milestoneId");

-- CreateIndex
CREATE INDEX "revision_requests_milestoneId_idx" ON "revision_requests"("milestoneId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_signatures_contractId_role_key" ON "contract_signatures"("contractId", "role");

-- CreateIndex
CREATE INDEX "amendments_contractId_idx" ON "amendments"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "amendment_signatures_amendmentId_role_key" ON "amendment_signatures"("amendmentId", "role");

-- CreateIndex
CREATE INDEX "contract_templates_ownerId_idx" ON "contract_templates"("ownerId");

-- CreateIndex
CREATE INDEX "template_milestones_templateId_idx" ON "template_milestones"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_invitations_token_key" ON "contract_invitations"("token");

-- CreateIndex
CREATE INDEX "contract_invitations_contractId_idx" ON "contract_invitations"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_accounts_contractId_key" ON "escrow_accounts"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_accounts_subAccountRef_key" ON "escrow_accounts"("subAccountRef");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_transactions_idempotencyKey_key" ON "escrow_transactions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "escrow_transactions_escrowAccountId_idx" ON "escrow_transactions"("escrowAccountId");

-- CreateIndex
CREATE INDEX "escrow_transactions_milestoneId_idx" ON "escrow_transactions"("milestoneId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_idempotencyKey_key" ON "payment_intents"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payment_intents_contractId_idx" ON "payment_intents"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_webhooks_externalId_key" ON "gateway_webhooks"("externalId");

-- CreateIndex
CREATE INDEX "gateway_webhooks_gateway_idx" ON "gateway_webhooks"("gateway");

-- CreateIndex
CREATE INDEX "transfers_senderId_idx" ON "transfers"("senderId");

-- CreateIndex
CREATE INDEX "transfers_recipientId_idx" ON "transfers"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_senderId_idempotencyKey_key" ON "transfers"("senderId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_transactionReference_key" ON "payment_transactions"("transactionReference");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_providerReference_key" ON "payment_transactions"("providerReference");

-- CreateIndex
CREATE INDEX "payment_transactions_userId_idx" ON "payment_transactions"("userId");

-- CreateIndex
CREATE INDEX "payment_transactions_provider_idx" ON "payment_transactions"("provider");

-- CreateIndex
CREATE INDEX "payment_transactions_status_idx" ON "payment_transactions"("status");

-- CreateIndex
CREATE INDEX "payment_transactions_operation_idx" ON "payment_transactions"("operation");

-- CreateIndex
CREATE INDEX "refunds_escrowAccountId_idx" ON "refunds"("escrowAccountId");

-- CreateIndex
CREATE INDEX "fee_records_escrowAccountId_idx" ON "fee_records"("escrowAccountId");

-- CreateIndex
CREATE INDEX "fee_records_contractId_idx" ON "fee_records"("contractId");

-- CreateIndex
CREATE INDEX "wallets_userId_idx" ON "wallets"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_userId_currency_key" ON "wallets"("userId", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_reference_key" ON "wallet_transactions"("reference");

-- CreateIndex
CREATE INDEX "wallet_transactions_walletId_idx" ON "wallet_transactions"("walletId");

-- CreateIndex
CREATE INDEX "wallet_transactions_referenceId_idx" ON "wallet_transactions"("referenceId");

-- CreateIndex
CREATE INDEX "payout_methods_userId_idx" ON "payout_methods"("userId");

-- CreateIndex
CREATE INDEX "payout_requests_userId_idx" ON "payout_requests"("userId");

-- CreateIndex
CREATE INDEX "payout_requests_walletId_idx" ON "payout_requests"("walletId");

-- CreateIndex
CREATE INDEX "payout_requests_status_idx" ON "payout_requests"("status");

-- CreateIndex
CREATE INDEX "fx_conversions_userId_idx" ON "fx_conversions"("userId");

-- CreateIndex
CREATE INDEX "fx_rates_log_baseCurrency_quoteCurrency_idx" ON "fx_rates_log"("baseCurrency", "quoteCurrency");

-- CreateIndex
CREATE INDEX "support_tickets_userId_idx" ON "support_tickets"("userId");

-- CreateIndex
CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");

-- CreateIndex
CREATE INDEX "support_messages_ticketId_idx" ON "support_messages"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "help_articles_slug_key" ON "help_articles"("slug");

-- CreateIndex
CREATE INDEX "help_articles_published_idx" ON "help_articles"("published");

-- CreateIndex
CREATE INDEX "consent_records_userId_idx" ON "consent_records"("userId");

-- CreateIndex
CREATE INDEX "contact_messages_handled_createdAt_idx" ON "contact_messages"("handled", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "blog_posts_slug_key" ON "blog_posts"("slug");

-- CreateIndex
CREATE INDEX "blog_posts_published_publishedAt_idx" ON "blog_posts"("published", "publishedAt");

-- CreateIndex
CREATE INDEX "blog_posts_lang_published_publishedAt_idx" ON "blog_posts"("lang", "published", "publishedAt");

-- CreateIndex
CREATE INDEX "blog_posts_translationKey_idx" ON "blog_posts"("translationKey");

-- CreateIndex
CREATE INDEX "blog_posts_category_idx" ON "blog_posts"("category");

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_type_key" ON "legal_documents"("type");

-- CreateIndex
CREATE INDEX "disputes_contractId_idx" ON "disputes"("contractId");

-- CreateIndex
CREATE INDEX "disputes_milestoneId_idx" ON "disputes"("milestoneId");

-- CreateIndex
CREATE INDEX "disputes_status_idx" ON "disputes"("status");

-- CreateIndex
CREATE INDEX "dispute_evidence_disputeId_idx" ON "dispute_evidence"("disputeId");

-- CreateIndex
CREATE INDEX "dispute_responses_disputeId_idx" ON "dispute_responses"("disputeId");

-- CreateIndex
CREATE INDEX "dispute_messages_disputeId_idx" ON "dispute_messages"("disputeId");

-- CreateIndex
CREATE INDEX "dispute_timeline_disputeId_idx" ON "dispute_timeline"("disputeId");

-- CreateIndex
CREATE INDEX "mediator_assignments_disputeId_idx" ON "mediator_assignments"("disputeId");

-- CreateIndex
CREATE UNIQUE INDEX "dispute_rulings_disputeId_key" ON "dispute_rulings"("disputeId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_recommendations_disputeId_key" ON "ai_recommendations"("disputeId");

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "notifications_category_idx" ON "notifications"("category");

-- CreateIndex
CREATE INDEX "notification_delivery_log_notificationId_idx" ON "notification_delivery_log"("notificationId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_category_channel_key" ON "notification_preferences"("userId", "category", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_token_key" ON "push_tokens"("token");

-- CreateIndex
CREATE INDEX "push_tokens_userId_idx" ON "push_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "message_threads_contractId_key" ON "message_threads"("contractId");

-- CreateIndex
CREATE INDEX "messages_threadId_idx" ON "messages"("threadId");

-- CreateIndex
CREATE INDEX "message_reports_status_idx" ON "message_reports"("status");

-- CreateIndex
CREATE INDEX "message_reports_messageId_idx" ON "message_reports"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_key_key" ON "notification_templates"("key");

-- CreateIndex
CREATE INDEX "message_attachments_messageId_idx" ON "message_attachments"("messageId");

-- CreateIndex
CREATE INDEX "admin_notifications_type_idx" ON "admin_notifications"("type");

-- CreateIndex
CREATE INDEX "admin_notifications_permission_idx" ON "admin_notifications"("permission");

-- CreateIndex
CREATE INDEX "admin_notifications_createdAt_idx" ON "admin_notifications"("createdAt");

-- CreateIndex
CREATE INDEX "admin_notification_reads_operatorId_idx" ON "admin_notification_reads"("operatorId");

-- CreateIndex
CREATE UNIQUE INDEX "admin_notification_reads_notificationId_operatorId_key" ON "admin_notification_reads"("notificationId", "operatorId");

-- CreateIndex
CREATE UNIQUE INDEX "files_objectKey_key" ON "files"("objectKey");

-- CreateIndex
CREATE INDEX "files_ownerId_idx" ON "files"("ownerId");

-- CreateIndex
CREATE INDEX "aml_alerts_userId_idx" ON "aml_alerts"("userId");

-- CreateIndex
CREATE INDEX "aml_alerts_status_idx" ON "aml_alerts"("status");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "reports_type_idx" ON "reports"("type");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_channels_userId_key" ON "whatsapp_channels"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_channels_phone_key" ON "whatsapp_channels"("phone");

-- CreateIndex
CREATE INDEX "whatsapp_messages_phone_idx" ON "whatsapp_messages"("phone");

-- CreateIndex
CREATE INDEX "whatsapp_messages_userId_idx" ON "whatsapp_messages"("userId");

-- CreateIndex
CREATE INDEX "whatsapp_messages_waMessageId_idx" ON "whatsapp_messages"("waMessageId");

-- CreateIndex
CREATE INDEX "whatsapp_campaigns_status_idx" ON "whatsapp_campaigns"("status");

-- CreateIndex
CREATE INDEX "whatsapp_campaigns_createdAt_idx" ON "whatsapp_campaigns"("createdAt");

-- CreateIndex
CREATE INDEX "whatsapp_campaign_recipients_campaignId_status_idx" ON "whatsapp_campaign_recipients"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_campaign_recipients_campaignId_phone_key" ON "whatsapp_campaign_recipients"("campaignId", "phone");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_adminRoleId_fkey" FOREIGN KEY ("adminRoleId") REFERENCES "admin_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "2fa_methods" ADD CONSTRAINT "2fa_methods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_codes" ADD CONSTRAINT "backup_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_kycRecordId_fkey" FOREIGN KEY ("kycRecordId") REFERENCES "kyc_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_review_queue" ADD CONSTRAINT "manual_review_queue_kycRecordId_fkey" FOREIGN KEY ("kycRecordId") REFERENCES "kyc_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_skills" ADD CONSTRAINT "profile_skills_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_skills" ADD CONSTRAINT "profile_skills_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "badges" ADD CONSTRAINT "badges_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_history" ADD CONSTRAINT "score_history_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_submissions" ADD CONSTRAINT "milestone_submissions_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision_requests" ADD CONSTRAINT "revision_requests_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amendments" ADD CONSTRAINT "amendments_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amendment_signatures" ADD CONSTRAINT "amendment_signatures_amendmentId_fkey" FOREIGN KEY ("amendmentId") REFERENCES "amendments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_milestones" ADD CONSTRAINT "template_milestones_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "contract_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_invitations" ADD CONSTRAINT "contract_invitations_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_escrowAccountId_fkey" FOREIGN KEY ("escrowAccountId") REFERENCES "escrow_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_escrowAccountId_fkey" FOREIGN KEY ("escrowAccountId") REFERENCES "escrow_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_records" ADD CONSTRAINT "fee_records_escrowAccountId_fkey" FOREIGN KEY ("escrowAccountId") REFERENCES "escrow_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_payoutMethodId_fkey" FOREIGN KEY ("payoutMethodId") REFERENCES "payout_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_evidence" ADD CONSTRAINT "dispute_evidence_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_responses" ADD CONSTRAINT "dispute_responses_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_messages" ADD CONSTRAINT "dispute_messages_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_timeline" ADD CONSTRAINT "dispute_timeline_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mediator_assignments" ADD CONSTRAINT "mediator_assignments_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_rulings" ADD CONSTRAINT "dispute_rulings_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_delivery_log" ADD CONSTRAINT "notification_delivery_log_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "message_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_notification_reads" ADD CONSTRAINT "admin_notification_reads_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "admin_notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_campaign_recipients" ADD CONSTRAINT "whatsapp_campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "whatsapp_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

