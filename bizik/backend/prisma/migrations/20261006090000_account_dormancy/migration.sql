-- Warnings sent before a dormant account is deleted.
--
-- One row per warning actually delivered, rather than a flag computed from the
-- user's timestamps. Two reasons, both about the row outliving the account:
-- "we gave notice" has to be provable after the user is gone, and the daily job
-- uses the absence of a row as its idempotency key, so a retry or a restart
-- cannot warn the same person twice.
CREATE TYPE "DormancyReason" AS ENUM ('NEVER_VERIFIED', 'NEVER_ACTIVE');

CREATE TABLE "account_dormancy_notices" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "reason"       "DormancyReason" NOT NULL,
  "stage"        INTEGER NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "channel"      TEXT NOT NULL,
  "sentAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "account_dormancy_notices_pkey" PRIMARY KEY ("id")
);

-- The idempotency guarantee: one warning per user, per reason, per stage.
CREATE UNIQUE INDEX "account_dormancy_notices_userId_reason_stage_key"
  ON "account_dormancy_notices" ("userId", "reason", "stage");

CREATE INDEX "account_dormancy_notices_userId_idx" ON "account_dormancy_notices" ("userId");
CREATE INDEX "account_dormancy_notices_sentAt_idx" ON "account_dormancy_notices" ("sentAt");
