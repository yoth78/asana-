import { Router } from 'express';
import { prisma } from '../index';
import { authenticate } from './auth.routes';
import { isUserInWorkspace } from '../membership';
import { logActivity } from '../activity.service';
import { createNotification } from '../notification.service';

const router = Router();
router.use(authenticate);

const TASK_UPDATABLE_FIELDS = ['title', 'description', 'status', 'priority', 'assigneeId', 'dueDate'];

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

const isAssigneeInWorkspace = (assigneeId: string, workspaceId: string) =>
  isUserInWorkspace(assigneeId, workspaceId);

const taskInWorkspace = async (taskId: string, workspaceId: string) => {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { select: { workspaceId: true, name: true } } }
  });
  if (!task || task.project.workspaceId !== workspaceId) return null;
  return task;
};

// ── Subtasks (must be registered before /:projectId) ──

router.get('/subtasks/:parentTaskId', async (req: any, res) => {
  try {
    const { parentTaskId } = req.params;
    const parent = await taskInWorkspace(parentTaskId, req.actor.workspaceId);
    if (!parent) return res.status(404).json({ error: 'Task not found' });

    const subtasks = await prisma.task.findMany({
      where: { parentTaskId },
      orderBy: { order: 'asc' }
    });
    res.json(subtasks.map(serializeTask));
  } catch (error) {
    console.error('List subtasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/subtasks', async (req: any, res) => {
  try {
    const { parentTaskId, title } = req.body || {};
    const actor = req.actor;

    if (!parentTaskId || !title?.trim()) {
      return res.status(400).json({ error: 'parentTaskId and title are required' });
    }

    const parent = await taskInWorkspace(parentTaskId, actor.workspaceId);
    if (!parent) return res.status(404).json({ error: 'Task not found' });

    const siblings = await prisma.task.count({ where: { parentTaskId } });

    const subtask = await prisma.task.create({
      data: {
        title: title.trim(),
        projectId: parent.projectId,
        parentTaskId,
        status: 'TODO',
        priority: parent.priority,
        order: siblings
      }
    });

    await logActivity({
      actorId: actor.id,
      action: 'subtask_created',
      entityId: parentTaskId,
      entityType: 'TASK',
      details: subtask.title
    });

    res.status(201).json(serializeTask(subtask));
  } catch (error) {
    console.error('Create subtask error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/subtasks/:id', async (req: any, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const actor = req.actor;

    const task = await prisma.task.findUnique({
      where: { id },
      include: { project: { select: { workspaceId: true } } }
    });
    if (!task?.parentTaskId || task.project.workspaceId !== actor.workspaceId) {
      return res.status(404).json({ error: 'Subtask not found' });
    }

    const data: any = {};
    for (const field of ['title', 'status']) {
      if (body[field] !== undefined) data[field] = body[field];
    }

    const updated = await prisma.task.update({ where: { id }, data });
    res.json(serializeTask(updated));
  } catch (error) {
    console.error('Update subtask error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/subtasks/:id', async (req: any, res) => {
  try {
    const { id } = req.params;
    const actor = req.actor;

    const task = await prisma.task.findUnique({
      where: { id },
      include: { project: { select: { workspaceId: true } } }
    });
    if (!task?.parentTaskId || task.project.workspaceId !== actor.workspaceId) {
      return res.status(404).json({ error: 'Subtask not found' });
    }

    await prisma.task.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Delete subtask error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get tasks for project
router.get('/:projectId', async (req: any, res) => {
  try {
    const { projectId } = req.params;
    const tasks = await prisma.task.findMany({
      where: { projectId }
    });
    res.json(tasks.map(serializeTask));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: any, res) => {
  try {
    const { title, description, projectId, assigneeId, status, priority, dueDate } = req.body;

    const user = req.actor;
    const workspaceId = user.workspaceId;

    if (!projectId) return res.status(400).json({ error: 'Invalid project' });
    const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId } });
    if (!project) return res.status(400).json({ error: 'Invalid project' });

    if (assigneeId && !(await isAssigneeInWorkspace(assigneeId, workspaceId))) {
      return res.status(400).json({ error: 'Invalid assignee' });
    }

    const task = await prisma.task.create({
      data: {
        title,
        description,
        projectId,
        assigneeId: assigneeId || null,
        status: status || 'TODO',
        priority: priority || 'MEDIUM',
        dueDate: dueDate ? new Date(dueDate) : null
      }
    });

    await logActivity({
      actorId: user.id,
      action: 'task_created',
      entityId: task.id,
      entityType: 'TASK',
      details: task.title
    });

    if (assigneeId && assigneeId !== user.id) {
      await createNotification(assigneeId, workspaceId, {
        type: 'task_assigned',
        title: 'New task assigned to you',
        description: `${user.name || user.email} assigned "${task.title}" to you`,
        targetId: task.id,
        targetType: 'task'
      });
    }

    res.status(201).json(serializeTask(task));
  } catch (error) {
    console.error('Task creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req: any, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const user = req.actor;

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const workspaceId = user.workspaceId;
    const project = await prisma.project.findFirst({ where: { id: task.projectId, workspaceId } });
    if (!project) return res.status(403).json({ error: 'Task is not in your workspace' });

    const data: any = {};
    for (const field of TASK_UPDATABLE_FIELDS) {
      if (body[field] === undefined) continue;
      data[field] = body[field];
    }

    if (data.dueDate !== undefined) {
      if (data.dueDate === null || data.dueDate === '') {
        data.dueDate = null;
      } else {
        const parsed = new Date(data.dueDate);
        if (isNaN(parsed.getTime())) {
          return res.status(400).json({ error: 'Invalid dueDate' });
        }
        data.dueDate = parsed;
      }
    }

    if (data.assigneeId !== undefined) {
      if (!data.assigneeId) {
        data.assigneeId = null;
      } else if (!(await isAssigneeInWorkspace(data.assigneeId, workspaceId))) {
        return res.status(400).json({ error: 'Invalid assignee' });
      }
    }

    const updated = await prisma.task.update({
      where: { id },
      data
    });

    if (data.status === 'DONE' && task.status !== 'DONE') {
      await logActivity({
        actorId: user.id,
        action: 'task_completed',
        entityId: task.id,
        entityType: 'TASK',
        details: task.title
      });
    }

    if (
      data.assigneeId &&
      data.assigneeId !== task.assigneeId &&
      data.assigneeId !== user.id
    ) {
      await createNotification(data.assigneeId, workspaceId, {
        type: 'task_assigned',
        title: 'Task assigned to you',
        description: `${user.name || user.email} assigned "${task.title}" to you`,
        targetId: task.id,
        targetType: 'task'
      });
    }

    res.json(serializeTask(updated));
  } catch (error) {
    console.error('Task update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    const { id } = req.params;

    const user = req.actor;

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const workspaceId = user.workspaceId;
    const project = await prisma.project.findFirst({ where: { id: task.projectId, workspaceId } });
    if (!project) return res.status(403).json({ error: 'Task is not in your workspace' });

    await prisma.task.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Task delete error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
