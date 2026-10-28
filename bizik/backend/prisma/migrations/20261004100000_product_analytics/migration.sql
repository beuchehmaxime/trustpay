-- Product analytics: visitor events and operating costs.
--
-- Three business questions had no data source at all. Visits and drop-off need
-- events nobody was recording; EBITDA and profit need costs nobody was
-- entering. Revenue, funnel and retention are derivable from existing tables
-- and are computed on read rather than stored, so they cannot drift.

CREATE TYPE "OperatingCostCategory" AS ENUM (
  'INFRASTRUCTURE', 'SALARIES', 'PAYMENT_PROVIDER', 'MARKETING', 'LEGAL_COMPLIANCE', 'OTHER'
);

CREATE TABLE "analytics_events" (
  "id"         TEXT NOT NULL,
  "visitorId"  TEXT NOT NULL,
  "userId"     TEXT,
  "name"       TEXT NOT NULL,
  "path"       TEXT,
  "referrer"   TEXT,
  "durationMs" INTEGER,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- Every analytics query is "events of this kind, in this window", so the
-- composite index is the one that matters; the others serve the per-visitor and
-- per-user joins that build the funnel.
CREATE INDEX "analytics_events_createdAt_idx" ON "analytics_events" ("createdAt");
CREATE INDEX "analytics_events_name_createdAt_idx" ON "analytics_events" ("name", "createdAt");
CREATE INDEX "analytics_events_visitorId_idx" ON "analytics_events" ("visitorId");
CREATE INDEX "analytics_events_userId_idx" ON "analytics_events" ("userId");

CREATE TABLE "operating_costs" (
  "id"          TEXT NOT NULL,
  "month"       TIMESTAMP(3) NOT NULL,
  "category"    "OperatingCostCategory" NOT NULL,
  "amountXaf"   DECIMAL(20,4) NOT NULL,
  "note"        TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "operating_costs_pkey" PRIMARY KEY ("id")
);

-- One figure per category per month: entering two makes the month ambiguous,
-- and an EBITDA that depends on which row was read last is not a number.
CREATE UNIQUE INDEX "operating_costs_month_category_key" ON "operating_costs" ("month", "category");
CREATE INDEX "operating_costs_month_idx" ON "operating_costs" ("month");
