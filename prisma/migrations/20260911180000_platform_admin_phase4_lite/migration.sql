-- Phase 4 lite: global feature kill-switches + compose email

CREATE TABLE "GlobalFeatureFlag" (
    "id" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "updatedByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalFeatureFlag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GlobalFeatureFlag_featureKey_key" ON "GlobalFeatureFlag"("featureKey");

CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailTemplate_createdAt_idx" ON "EmailTemplate"("createdAt");

CREATE TABLE "OutboundEmail" (
    "id" TEXT NOT NULL,
    "staffId" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "templateId" TEXT,
    "recipientCount" INT NOT NULL DEFAULT 0,
    "sentCount" INT NOT NULL DEFAULT 0,
    "failedCount" INT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundEmail_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OutboundEmail_createdAt_idx" ON "OutboundEmail"("createdAt");
CREATE INDEX "OutboundEmail_staffId_createdAt_idx" ON "OutboundEmail"("staffId", "createdAt");

CREATE TABLE "OutboundEmailRecipient" (
    "id" TEXT NOT NULL,
    "outboundEmailId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundEmailRecipient_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OutboundEmailRecipient_outboundEmailId_status_idx" ON "OutboundEmailRecipient"("outboundEmailId", "status");
CREATE INDEX "OutboundEmailRecipient_email_idx" ON "OutboundEmailRecipient"("email");

ALTER TABLE "OutboundEmailRecipient" ADD CONSTRAINT "OutboundEmailRecipient_outboundEmailId_fkey" FOREIGN KEY ("outboundEmailId") REFERENCES "OutboundEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;
