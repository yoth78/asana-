-- Platform admin Phase 1: staff accounts, audit log, feature overrides, renewBlocked

CREATE TABLE IF NOT EXISTS "PlatformUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SUPPORT',
    "mfaSecret" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlatformUser_email_key" ON "PlatformUser"("email");

CREATE TABLE IF NOT EXISTS "PlatformAuditLog" (
    "id" TEXT NOT NULL,
    "staffId" TEXT,
    "action" TEXT NOT NULL,
    "workspaceId" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PlatformAuditLog_workspaceId_createdAt_idx" ON "PlatformAuditLog"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "PlatformAuditLog_staffId_createdAt_idx" ON "PlatformAuditLog"("staffId", "createdAt");
CREATE INDEX IF NOT EXISTS "PlatformAuditLog_action_createdAt_idx" ON "PlatformAuditLog"("action", "createdAt");

ALTER TABLE "PlatformAuditLog"
  DROP CONSTRAINT IF EXISTS "PlatformAuditLog_staffId_fkey";
ALTER TABLE "PlatformAuditLog"
  ADD CONSTRAINT "PlatformAuditLog_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "WorkspaceFeatureOverride" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "setByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceFeatureOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceFeatureOverride_workspaceId_featureKey_key"
  ON "WorkspaceFeatureOverride"("workspaceId", "featureKey");
CREATE INDEX IF NOT EXISTS "WorkspaceFeatureOverride_workspaceId_idx"
  ON "WorkspaceFeatureOverride"("workspaceId");

ALTER TABLE "WorkspaceFeatureOverride"
  DROP CONSTRAINT IF EXISTS "WorkspaceFeatureOverride_workspaceId_fkey";
ALTER TABLE "WorkspaceFeatureOverride"
  ADD CONSTRAINT "WorkspaceFeatureOverride_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "renewBlocked" BOOLEAN NOT NULL DEFAULT false;
