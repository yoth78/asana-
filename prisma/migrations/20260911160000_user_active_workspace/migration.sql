-- Persist which workspace the user last used (multi-workspace switching).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "activeWorkspaceId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_activeWorkspaceId_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_activeWorkspaceId_fkey"
      FOREIGN KEY ("activeWorkspaceId") REFERENCES "Workspace"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "User_activeWorkspaceId_idx" ON "User"("activeWorkspaceId");
