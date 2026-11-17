import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchWorkspaceBootstrap } from '../api/workspaceApi';
import { queryClient, workspaceQueryKey } from '../lib/queryClient';
import {
  clearWorkspaceCaches,
  readWorkspaceCache,
  writeWorkspaceCache,
  type WorkspaceBootstrapPayload
} from '../lib/workspaceCache';
import { useWorkspaceStore } from '../store/workspaceStore';

/**
 * Loads workspace data via React Query (memory cache + background refresh)
 * and mirrors it into Zustand for existing screens. Seeds from sessionStorage
 * so revisits paint immediately.
 */
export function useWorkspaceBootstrap(workspaceId: string | undefined, userId: string | undefined) {
  const applyBootstrap = useWorkspaceStore(s => s.applyBootstrap);

  // Instant paint from browser session snapshot (does not skip the network refresh).
  useEffect(() => {
    if (!userId || !workspaceId) return;
    const cached = readWorkspaceCache(userId, workspaceId);
    if (cached) applyBootstrap(workspaceId, cached);
  }, [userId, workspaceId, applyBootstrap]);

  const query = useQuery<WorkspaceBootstrapPayload>({
    queryKey: workspaceId ? workspaceQueryKey(workspaceId) : ['workspace-bootstrap', 'none'],
    queryFn: async () => {
      const data = await fetchWorkspaceBootstrap(workspaceId!);
      if (userId) writeWorkspaceCache(userId, workspaceId!, data);
      return data;
    },
    enabled: Boolean(workspaceId && userId)
  });

  useEffect(() => {
    if (!workspaceId || !query.data) return;
    applyBootstrap(workspaceId, query.data);
  }, [workspaceId, query.data, applyBootstrap]);

  return query;
}

export function clearClientDataCaches() {
  queryClient.clear();
  clearWorkspaceCaches();
}
