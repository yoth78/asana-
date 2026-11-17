import { prisma } from '../index';

export type SegmentId =
  | 'free_empty'
  | 'signed_up_no_department'
  | 'newsletter'
  | 'inactive_14d';

export type SegmentTarget = {
  email: string;
  name?: string | null;
  workspaceId?: string | null;
};

export const SEGMENT_IDS: SegmentId[] = [
  'free_empty',
  'signed_up_no_department',
  'newsletter',
  'inactive_14d'
];

export function isSegmentId(v: string): v is SegmentId {
  return (SEGMENT_IDS as string[]).includes(v);
}

/** Resolve campaign/export targets for a named segment. */
export async function resolveSegmentTargets(segment: SegmentId): Promise<SegmentTarget[]> {
  if (segment === 'newsletter') {
    const subs = await prisma.newsletterSubscriber.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { subscribedAt: 'desc' }
    });
    return subs.map(s => ({ email: s.email, name: s.name, workspaceId: null }));
  }

  if (segment === 'free_empty') {
    const workspaces = await prisma.workspace.findMany({
      where: { plan: 'FREE' },
      include: {
        owner: { select: { email: true, name: true } },
        _count: { select: { teams: true } }
      }
    });
    return workspaces
      .filter(w => w._count.teams === 0)
      .map(w => ({
        email: w.owner.email,
        name: w.owner.name,
        workspaceId: w.id
      }));
  }

  if (segment === 'signed_up_no_department') {
    const cutoff = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    const workspaces = await prisma.workspace.findMany({
      where: { createdAt: { lte: cutoff } },
      include: {
        owner: { select: { email: true, name: true } },
        _count: { select: { teams: true } }
      }
    });
    return workspaces
      .filter(w => w._count.teams === 0)
      .map(w => ({
        email: w.owner.email,
        name: w.owner.name,
        workspaceId: w.id
      }));
  }

  // inactive_14d — no activity log in last 14 days
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const workspaces = await prisma.workspace.findMany({
    where: { status: 'ACTIVE' },
    include: {
      owner: { select: { email: true, name: true } },
      members: { select: { userId: true }, take: 50 }
    }
  });

  const results: SegmentTarget[] = [];
  for (const w of workspaces) {
    const userIds = w.members.map(m => m.userId);
    if (userIds.length === 0) {
      results.push({ email: w.owner.email, name: w.owner.name, workspaceId: w.id });
      continue;
    }
    const recent = await prisma.activityLog.findFirst({
      where: {
        actorId: { in: userIds },
        timestamp: { gte: since }
      },
      select: { id: true }
    });
    if (!recent) {
      results.push({ email: w.owner.email, name: w.owner.name, workspaceId: w.id });
    }
  }
  return results;
}
