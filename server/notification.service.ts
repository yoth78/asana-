import { prisma } from './index';

export type NotificationPayload = {
  type: string;
  title: string;
  description: string;
  targetId: string;
  targetType: 'task' | 'project' | 'comment';
};

export const createNotification = async (
  userId: string,
  workspaceId: string,
  payload: NotificationPayload
) => {
  if (!userId) return null;
  return prisma.notification.create({
    data: {
      userId,
      workspaceId,
      type: payload.type,
      payload: JSON.stringify(payload),
      read: false
    }
  });
};

export const notifyMany = async (
  userIds: string[],
  workspaceId: string,
  payload: NotificationPayload,
  excludeUserId?: string
) => {
  const unique = [...new Set(userIds)].filter(id => id && id !== excludeUserId);
  await Promise.all(unique.map(userId => createNotification(userId, workspaceId, payload)));
};

export const serializeNotification = (row: {
  id: string;
  type: string;
  payload: string;
  read: boolean;
  createdAt: Date;
}) => {
  let parsed: NotificationPayload = {
    type: row.type,
    title: row.type,
    description: '',
    targetId: '',
    targetType: 'task'
  };
  try {
    parsed = { ...parsed, ...JSON.parse(row.payload) };
  } catch {
    /* keep defaults */
  }
  return {
    id: row.id,
    type: parsed.type || row.type,
    title: parsed.title,
    description: parsed.description,
    targetId: parsed.targetId,
    targetType: parsed.targetType,
    read: row.read,
    createdAt: row.createdAt.toISOString()
  };
};
