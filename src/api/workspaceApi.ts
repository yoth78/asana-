import type { WorkspaceBootstrapPayload } from '../lib/workspaceCache';

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
};

export async function fetchWorkspaceBootstrap(
  workspaceId: string
): Promise<WorkspaceBootstrapPayload> {
  const bootRes = await fetch(`/api/workspaces/${workspaceId}/bootstrap`, {
    headers: authHeaders()
  });

  if (bootRes.ok) {
    const data = await bootRes.json();
    return {
      departments: data.departments || [],
      projects: data.projects || [],
      tasks: data.tasks || [],
      workspaces: data.workspaces || [],
      activityLog: data.activityLog || []
    };
  }

  // Fallback: parallel list endpoints (older servers / partial outages).
  const [deptRes, projRes, wsRes] = await Promise.all([
    fetch(`/api/departments/${workspaceId}`, { headers: authHeaders() }),
    fetch(`/api/projects/${workspaceId}`, { headers: authHeaders() }),
    fetch('/api/workspaces', { headers: authHeaders() })
  ]);

  if (!deptRes.ok || !projRes.ok) {
    throw new Error('Failed to load workspace data');
  }

  const departments = await deptRes.json();
  const projects = await projRes.json();
  const workspaces = wsRes.ok ? await wsRes.json() : [];

  const taskResults = await Promise.all(
    projects.map((proj: { id: string }) =>
      fetch(`/api/tasks/${proj.id}`, { headers: authHeaders() }).then(async tRes =>
        tRes.ok ? tRes.json() : []
      )
    )
  );

  let activityLog: unknown[] = [];
  try {
    const actRes = await fetch('/api/activity?limit=50', { headers: authHeaders() });
    if (actRes.ok) activityLog = await actRes.json();
  } catch {
    /* optional */
  }

  return {
    departments,
    projects,
    tasks: taskResults.flat(),
    workspaces,
    activityLog
  };
}
