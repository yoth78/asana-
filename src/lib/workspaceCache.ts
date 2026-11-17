/** Browser-side snapshot so the app can paint workspace data before the network returns. */

const PREFIX = 'tf-ws-bootstrap-v1:';
const MAX_AGE_MS = 30 * 60 * 1000;

export type WorkspaceBootstrapPayload = {
  departments: unknown[];
  projects: unknown[];
  tasks: unknown[];
  workspaces: unknown[];
  activityLog: unknown[];
};

type CacheEnvelope = {
  userId: string;
  workspaceId: string;
  savedAt: number;
  data: WorkspaceBootstrapPayload;
};

const keyFor = (userId: string, workspaceId: string) =>
  `${PREFIX}${userId}:${workspaceId}`;

export function readWorkspaceCache(
  userId: string,
  workspaceId: string
): WorkspaceBootstrapPayload | null {
  try {
    const raw = sessionStorage.getItem(keyFor(userId, workspaceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope;
    if (
      parsed.userId !== userId ||
      parsed.workspaceId !== workspaceId ||
      Date.now() - parsed.savedAt > MAX_AGE_MS
    ) {
      sessionStorage.removeItem(keyFor(userId, workspaceId));
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeWorkspaceCache(
  userId: string,
  workspaceId: string,
  data: WorkspaceBootstrapPayload
) {
  try {
    const envelope: CacheEnvelope = {
      userId,
      workspaceId,
      savedAt: Date.now(),
      data
    };
    sessionStorage.setItem(keyFor(userId, workspaceId), JSON.stringify(envelope));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function clearWorkspaceCaches() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach(k => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
