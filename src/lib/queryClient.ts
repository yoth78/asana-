import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: true
    }
  }
});

export const workspaceQueryKey = (workspaceId: string) =>
  ['workspace-bootstrap', workspaceId] as const;
