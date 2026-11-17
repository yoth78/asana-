import { prisma } from './index';

export const logActivity = async (opts: {
  actorId: string;
  action: string;
  entityId: string;
  entityType: string;
  details?: string;
}) => {
  return prisma.activityLog.create({
    data: {
      actorId: opts.actorId,
      action: opts.action,
      entityId: opts.entityId,
      entityType: opts.entityType,
      details: opts.details ?? null
    }
  });
};

export const serializeActivity = (row: {
  id: string;
  actorId: string;
  action: string;
  entityId: string;
  entityType: string;
  details: string | null;
  timestamp: Date;
  actor?: { name: string | null } | null;
}) => ({
  id: row.id,
  userId: row.actorId,
  userName: row.actor?.name || undefined,
  action: row.action,
  targetId: row.entityId,
  targetType: row.entityType,
  details: row.details || undefined,
  createdAt: row.timestamp.toISOString()
});
