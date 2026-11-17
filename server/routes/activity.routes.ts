import { Router } from 'express';
import { prisma } from '../index';
import { authenticate } from './auth.routes';
import { listWorkspaceActors } from '../membership';
import { serializeActivity } from '../activity.service';

const router = Router();
router.use(authenticate);

router.get('/', async (req: any, res) => {
  try {
    const actor = req.actor;
    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 100);

    const actors = await listWorkspaceActors(actor.workspaceId);
    const actorIds = actors.map(a => a.id);
    if (actorIds.length === 0) return res.json([]);

    const rows = await prisma.activityLog.findMany({
      where: { actorId: { in: actorIds } },
      orderBy: { timestamp: 'desc' },
      take: limit,
      include: { actor: { select: { name: true } } }
    });

    res.json(rows.map(serializeActivity));
  } catch (error) {
    console.error('List activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
