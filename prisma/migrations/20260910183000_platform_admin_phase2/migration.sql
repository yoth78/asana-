-- Phase 2: support notes + newsletter subscribers

CREATE TABLE IF NOT EXISTS "WorkspaceSupportNote" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "staffId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSupportNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WorkspaceSupportNote_workspaceId_createdAt_idx"
  ON "WorkspaceSupportNote"("workspaceId", "createdAt");

ALTER TABLE "WorkspaceSupportNote"
  DROP CONSTRAINT IF EXISTS "WorkspaceSupportNote_workspaceId_fkey";
ALTER TABLE "WorkspaceSupportNote"
  ADD CONSTRAINT "WorkspaceSupportNote_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceSupportNote"
  DROP CONSTRAINT IF EXISTS "WorkspaceSupportNote_staffId_fkey";
ALTER TABLE "WorkspaceSupportNote"
  ADD CONSTRAINT "WorkspaceSupportNote_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "NewsletterSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "source" TEXT NOT NULL DEFAULT 'website',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribedAt" TIMESTAMP(3),
    "metaJson" TEXT,

    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NewsletterSubscriber_email_key" ON "NewsletterSubscriber"("email");
CREATE INDEX IF NOT EXISTS "NewsletterSubscriber_status_subscribedAt_idx"
  ON "NewsletterSubscriber"("status", "subscribedAt");
