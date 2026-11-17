import { Router } from 'express';
import { prisma } from '../index';
import { authenticate } from './auth.routes';
import { logActivity } from '../activity.service';
import { createNotification, notifyMany } from '../notification.service';

const router = Router();
router.use(authenticate);

const serializeComment = (row: {
  id: string;
  taskId: string;
  content: string;
  authorId: string;
  createdAt: Date;
  author?: { name: string | null; email: string } | null;
}) => ({
  id: row.id,
  taskId: row.taskId,
  userId: row.authorId,
  userName: row.author?.name || row.author?.email || 'User',
  content: row.content,
  createdAt: row.createdAt.toISOString()
});

const taskInWorkspace = async (taskId: string, workspaceId: string) => {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { select: { workspaceId: true, name: true } } }
  });
  if (!task || task.project.workspaceId !== workspaceId) return null;
  return task;
};

router.get('/task/:taskId', async (req: any, res) => {
  try {
    const { taskId } = req.params;
    const task = await taskInWorkspace(taskId, req.actor.workspaceId);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const comments = await prisma.comment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { name: true, email: true } } }
    });
    res.json(comments.map(serializeComment));
  } catch (error) {
    console.error('List comments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/task/:taskId', async (req: any, res) => {
  try {
    const { taskId } = req.params;
    const { content, mentionUserIds } = req.body || {};
    const actor = req.actor;

    if (!content?.trim()) return res.status(400).json({ error: 'Comment content is required' });

    const task = await taskInWorkspace(taskId, actor.workspaceId);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const mentions: string[] = Array.isArray(mentionUserIds)
      ? mentionUserIds.filter((id: unknown) => typeof id === 'string')
      : [];

    const comment = await prisma.comment.create({
      data: {
        taskId,
        content: content.trim(),
        authorId: actor.id,
        mentions: JSON.stringify(mentions)
      },
      include: { author: { select: { name: true, email: true } } }
    });

    await logActivity({
      actorId: actor.id,
      action: 'comment_added',
      entityId: taskId,
      entityType: 'TASK',
      details: task.title
    });

    const notifyIds = mentions.filter(id => id !== actor.id);

    if (task.assigneeId && task.assigneeId !== actor.id && !notifyIds.includes(task.assigneeId)) {
      await createNotification(task.assigneeId, actor.workspaceId, {
        type: 'comment_added',
        title: 'New comment on your task',
        description: `${actor.name || actor.email} commented on "${task.title}"`,
        targetId: taskId,
        targetType: 'task'
      });
    }

    if (notifyIds.length > 0) {
      await notifyMany(
        notifyIds,
        actor.workspaceId,
        {
          type: 'comment_mention',
          title: 'You were mentioned',
          description: `${actor.name || actor.email} mentioned you on "${task.title}"`,
          targetId: taskId,
          targetType: 'task'
        },
        actor.id
      );
    }

    res.status(201).json(serializeComment(comment));
  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    const { id } = req.params;
    const actor = req.actor;

    const comment = await prisma.comment.findUnique({
      where: { id },
      include: { task: { include: { project: { select: { workspaceId: true } } } } }
    });
    if (!comment || comment.task.project.workspaceId !== actor.workspaceId) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    if (comment.authorId !== actor.id && actor.role !== 'SUPER_ADMIN' && actor.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not allowed to delete this comment' });
    }

    await prisma.comment.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
