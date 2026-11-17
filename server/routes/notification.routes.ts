import { Router } from 'express';
import { prisma } from '../index';
import { authenticate } from './auth.routes';
import { serializeNotification } from '../notification.service';

const router = Router();
router.use(authenticate);

router.get('/', async (req: any, res) => {
  try {
    const actor = req.actor;
    const rows = await prisma.notification.findMany({
      where: {
        userId: actor.id,
        OR: [{ workspaceId: actor.workspaceId }, { workspaceId: null }]
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json(rows.map(serializeNotification));
  } catch (error) {
    console.error('List notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/unread-count', async (req: any, res) => {
  try {
    const actor = req.actor;
    const count = await prisma.notification.count({
      where: {
        userId: actor.id,
        read: false,
        OR: [{ workspaceId: actor.workspaceId }, { workspaceId: null }]
      }
    });
    res.json({ count });
  } catch (error) {
    console.error('Unread count error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/read-all', async (req: any, res) => {
  try {
    const actor = req.actor;
    await prisma.notification.updateMany({
      where: {
        userId: actor.id,
        read: false,
        OR: [{ workspaceId: actor.workspaceId }, { workspaceId: null }]
      },
      data: { read: true }
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id/read', async (req: any, res) => {
  try {
    const { id } = req.params;
    const actor = req.actor;

    const row = await prisma.notification.findFirst({
      where: { id, userId: actor.id }
    });
    if (!row) return res.status(404).json({ error: 'Notification not found' });

    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true }
    });
    res.json(serializeNotification(updated));
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
