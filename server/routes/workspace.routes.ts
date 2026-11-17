import { Router } from 'express';
import { prisma } from '../index';
import { authenticate } from './auth.routes';
import { addWorkspaceMember, listWorkspaceActors, visibleProjectsWhere } from '../membership';
import { serializeActivity } from '../activity.service';

const router = Router();

router.use(authenticate);

const DEFAULT_DEPT_COLOR = '#6C5CE7';
const DEFAULT_PROJECT_COLOR = '#6C5CE7';

const mapDepartmentForClient = (team: any) => {
  const memberRows = Array.isArray(team.teamMembers) ? team.teamMembers : [];
  return {
    id: team.id,
    name: team.name,
    description: team.description || `${team.name} Department`,
    color: team.color || DEFAULT_DEPT_COLOR,
    adminId: team.leadId,
    memberIds: memberRows.map((m: any) => m.userId),
    memberCount: memberRows.length,
    budget: 0,
    expenses: 0,
    goals: [],
    createdAt: team.createdAt,
    updatedAt: team.updatedAt
  };
};

const serializeProject = (p: any, ownerId: string, members?: any[]) => ({
  ...p,
  departmentId: p.teamId || undefined,
  color: p.color || DEFAULT_PROJECT_COLOR,
  ownerId,
  description: p.description || '',
  memberIds: Array.isArray(members) ? members.map((m: any) => m.userId) : undefined,
  memberCount: Array.isArray(members) ? members.length : undefined
});

const serializeTask = (task: any) => {
  let labels: string[] = [];
  try {
    const parsed = JSON.parse(task.labels ?? '[]');
    if (Array.isArray(parsed)) labels = parsed;
  } catch {
    labels = [];
  }
  return { ...task, labels, parentTaskId: task.parentTaskId ?? null };
};

// Get all workspaces for the authenticated user
router.get('/', async (req: any, res) => {
  try {
    const workspaces = await prisma.workspace.findMany({
      where: {
        members: { some: { userId: req.user.userId, status: 'ACTIVE' } }
      }
    });
    res.json(workspaces);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * One-shot load for app startup: departments, visible projects, their tasks,
 * workspaces, and recent activity — same shapes as the individual list endpoints.
 */
router.get('/:workspaceId/bootstrap', async (req: any, res) => {
  try {
    const { workspaceId } = req.params;
    const actor = req.actor;

    if (workspaceId !== actor.workspaceId) {
      return res.status(403).json({ error: 'Cannot bootstrap another workspace' });
    }

    const projectWhere = visibleProjectsWhere(actor);

    const [teams, projects, workspaces, actors] = await Promise.all([
      prisma.team.findMany({
        where: { workspaceId },
        include: { lead: true, teamMembers: true }
      }),
      prisma.project.findMany({
        where: projectWhere,
        include: { members: true }
      }),
      prisma.workspace.findMany({
        where: {
          members: { some: { userId: actor.id, status: 'ACTIVE' } }
        }
      }),
      listWorkspaceActors(workspaceId)
    ]);

    const projectIds = projects.map(p => p.id);
    const actorIds = actors.map(a => a.id);

    const [tasks, activityRows] = await Promise.all([
      projectIds.length === 0
        ? Promise.resolve([])
        : prisma.task.findMany({
            where: { projectId: { in: projectIds } }
          }),
      actorIds.length === 0
        ? Promise.resolve([])
        : prisma.activityLog.findMany({
            where: { actorId: { in: actorIds } },
            orderBy: { timestamp: 'desc' },
            take: 50,
            include: { actor: { select: { name: true } } }
          })
    ]);

    res.json({
      departments: teams.map(mapDepartmentForClient),
      projects: projects.map(p => serializeProject(p, actor.id, p.members)),
      tasks: tasks.map(serializeTask),
      workspaces,
      activityLog: activityRows.map(serializeActivity)
    });
  } catch (error) {
    console.error('Workspace bootstrap error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create workspace
router.post('/', async (req: any, res) => {
  try {
    const { name } = req.body;
    const workspace = await prisma.workspace.create({
      data: {
        name,
        ownerId: req.user.userId,
        plan: 'FREE',
        status: 'ACTIVE'
      }
    });
    await addWorkspaceMember(req.user.userId, workspace.id, 'SUPER_ADMIN');
    const { ensureFreeSubscription } = await import('../entitlements');
    await ensureFreeSubscription(workspace.id);
    res.status(201).json(workspace);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
