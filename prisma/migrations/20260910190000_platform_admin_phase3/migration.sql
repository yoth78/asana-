-- Phase 3: plan catalog, coupons, campaigns

CREATE TABLE IF NOT EXISTS "PlanCatalogEntry" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "featuresJson" TEXT NOT NULL,
    "limitsJson" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanCatalogEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlanCatalogEntry_planId_key" ON "PlanCatalogEntry"("planId");

CREATE TABLE IF NOT EXISTS "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "percentOff" INTEGER,
    "amountOff" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'ETB',
    "appliesToPlan" TEXT,
    "maxRedemptions" INTEGER,
    "redeemedCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Coupon_code_key" ON "Coupon"("code");
CREATE INDEX IF NOT EXISTS "Coupon_active_expiresAt_idx" ON "Coupon"("active", "expiresAt");

CREATE TABLE IF NOT EXISTS "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "offerType" TEXT NOT NULL DEFAULT 'FEATURE',
    "featureKey" TEXT,
    "featureDays" INTEGER DEFAULT 30,
    "couponCode" TEXT,
    "emailSubject" TEXT,
    "emailBody" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "targetedCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "grantedCount" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "createdByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Campaign_status_createdAt_idx" ON "Campaign"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "CampaignSend" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "workspaceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignSend_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CampaignSend_campaignId_status_idx" ON "CampaignSend"("campaignId", "status");
CREATE INDEX IF NOT EXISTS "CampaignSend_email_idx" ON "CampaignSend"("email");

ALTER TABLE "CampaignSend"
  DROP CONSTRAINT IF EXISTS "CampaignSend_campaignId_fkey";
ALTER TABLE "CampaignSend"
  ADD CONSTRAINT "CampaignSend_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
