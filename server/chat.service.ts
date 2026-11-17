import { prisma } from './index';
import type { Actor } from './membership';
import { getProjectMembership, isUserInWorkspace } from './membership';

const GENERAL_CHANNEL_NAME = 'general';

export const dmPairKey = (userIdA: string, userIdB: string) =>
  [userIdA, userIdB].sort().join(':');

export const authorSelect = { id: true, name: true, email: true, profilePic: true };

const upsertChannelMember = (channelId: string, userId: string) =>
  prisma.channelMember.upsert({
    where: { channelId_userId: { channelId, userId } },
    create: { channelId, userId, source: 'AUTO' },
    update: {}
  });

/** Find or create the company #general channel (no full member sync). */
export const findOrCreateGeneralChannel = async (workspaceId: string) => {
  let channel = await prisma.channel.findFirst({
    where: {
      workspaceId,
      type: 'WORKSPACE',
      OR: [{ isDefault: true }, { name: GENERAL_CHANNEL_NAME }]
    },
    orderBy: { isDefault: 'desc' }
  });

  if (!channel) {
    channel = await prisma.channel.create({
      data: {
        workspaceId,
        type: 'WORKSPACE',
        name: GENERAL_CHANNEL_NAME,
        isDefault: true
      }
    });
  } else if (!channel.isDefault || channel.name !== GENERAL_CHANNEL_NAME) {
    channel = await prisma.channel.update({
      where: { id: channel.id },
      data: { isDefault: true, name: GENERAL_CHANNEL_NAME }
    });
  }

  return channel;
};

/** Full workspace sync — use on invite/signup only, not on every chat load. */
export const ensureWorkspaceChannel = async (workspaceId: string) => {
  const channel = await findOrCreateGeneralChannel(workspaceId);
  await syncWorkspaceChannelMembers(workspaceId, channel.id);
  return channel;
};

export const syncWorkspaceChannelMembers = async (workspaceId: string, channelId?: string) => {
  const channel = channelId
    ? await prisma.channel.findUnique({ where: { id: channelId } })
    : await findOrCreateGeneralChannel(workspaceId);
  if (!channel) return;

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, status: 'ACTIVE' },
    select: { userId: true }
  });
  if (members.length === 0) return;

  await prisma.channelMember.createMany({
    data: members.map(({ userId }) => ({
      channelId: channel.id,
      userId,
      source: 'AUTO'
    })),
    skipDuplicates: true
  });
};

const findOrCreateDepartmentChannel = async (teamId: string) => {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return null;

  let channel = await prisma.channel.findFirst({
    where: { workspaceId: team.workspaceId, type: 'DEPARTMENT', teamId }
  });
  if (!channel) {
    channel = await prisma.channel.create({
      data: {
        workspaceId: team.workspaceId,
        type: 'DEPARTMENT',
        name: team.name,
        teamId
      }
    });
  } else if (channel.name !== team.name) {
    channel = await prisma.channel.update({
      where: { id: channel.id },
      data: { name: team.name }
    });
  }
  return channel;
};

export const ensureDepartmentChannel = async (teamId: string) => {
  const channel = await findOrCreateDepartmentChannel(teamId);
  if (!channel) return null;
  await syncDepartmentChannelMembers(teamId, channel.id);
  return channel;
};

export const syncDepartmentChannelMembers = async (teamId: string, channelId?: string) => {
  const channel = channelId
    ? await prisma.channel.findUnique({ where: { id: channelId } })
    : await findOrCreateDepartmentChannel(teamId);
  if (!channel) return;

  const members = await prisma.teamMember.findMany({
    where: { teamId },
    select: { userId: true }
  });
  if (members.length === 0) return;

  await prisma.channelMember.createMany({
    data: members.map(({ userId }) => ({
      channelId: channel.id,
      userId,
      source: 'AUTO'
    })),
    skipDuplicates: true
  });
};

const findOrCreateProjectChannel = async (projectId: string) => {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return null;

  let channel = await prisma.channel.findFirst({
    where: { workspaceId: project.workspaceId, type: 'PROJECT', projectId }
  });
  if (!channel) {
    channel = await prisma.channel.create({
      data: {
        workspaceId: project.workspaceId,
        type: 'PROJECT',
        name: project.name,
        projectId
      }
    });
  } else if (channel.name !== project.name) {
    channel = await prisma.channel.update({
      where: { id: channel.id },
      data: { name: project.name }
    });
  }
  return channel;
};

export const ensureProjectChannel = async (projectId: string) => {
  const channel = await findOrCreateProjectChannel(projectId);
  if (!channel) return null;
  await syncProjectChannelMembers(projectId, channel.id);
  return channel;
};

export const syncProjectChannelMembers = async (projectId: string, channelId?: string) => {
  const channel = channelId
    ? await prisma.channel.findUnique({ where: { id: channelId } })
    : await findOrCreateProjectChannel(projectId);
  if (!channel) return;

  const members = await prisma.projectMember.findMany({
    where: { projectId },
    select: { userId: true }
  });
  if (members.length === 0) return;

  await prisma.channelMember.createMany({
    data: members.map(({ userId }) => ({
      channelId: channel.id,
      userId,
      source: 'AUTO'
    })),
    skipDuplicates: true
  });
};

/**
 * Fast path for chat loads: ensure only the current user is in their channels.
 * Fixes missing #general for members and avoids syncing the entire workspace each request.
 */
export const ensureActorChatMembership = async (actor: Actor) => {
  const jobs: Promise<unknown>[] = [];

  jobs.push(
    (async () => {
      const channel = await findOrCreateGeneralChannel(actor.workspaceId);
      await upsertChannelMember(channel.id, actor.id);
    })()
  );

  const teamIds = new Set<string>();
  if (actor.teamId) teamIds.add(actor.teamId);

  const teamMemberships = await prisma.teamMember.findMany({
    where: { userId: actor.id, team: { workspaceId: actor.workspaceId } },
    select: { teamId: true }
  });
  teamMemberships.forEach(({ teamId }) => teamIds.add(teamId));

  for (const teamId of teamIds) {
    jobs.push(
      (async () => {
        const channel = await findOrCreateDepartmentChannel(teamId);
        if (channel) await upsertChannelMember(channel.id, actor.id);
      })()
    );
  }

  const projectMemberships = await prisma.projectMember.findMany({
    where: { userId: actor.id, project: { workspaceId: actor.workspaceId } },
    select: { projectId: true }
  });

  for (const { projectId } of projectMemberships) {
    jobs.push(
      (async () => {
        const channel = await findOrCreateProjectChannel(projectId);
        if (channel) await upsertChannelMember(channel.id, actor.id);
      })()
    );
  }

  await Promise.all(jobs);
};

/** @deprecated Use ensureActorChatMembership for API reads. Kept for backwards compatibility. */
export const refreshActorChannels = ensureActorChatMembership;

export const addChannelMemberByAdmin = async (channelId: string, userId: string, workspaceId: string) => {
  if (!(await isUserInWorkspace(userId, workspaceId))) {
    throw new Error('User must belong to this company');
  }
  return prisma.channelMember.upsert({
    where: { channelId_userId: { channelId, userId } },
    create: { channelId, userId, source: 'ADMIN' },
    update: { source: 'ADMIN' }
  });
};

export const isProjectAdminInWorkspace = async (userId: string, workspaceId: string) => {
  const count = await prisma.projectMember.count({
    where: {
      userId,
      role: 'ADMIN',
      project: { workspaceId }
    }
  });
  return count > 0;
};

export const canStartDmWith = async (actor: Actor, targetUserId: string) => {
  if (actor.id === targetUserId) return false;
  if (!(await isUserInWorkspace(targetUserId, actor.workspaceId))) return false;

  if (actor.role === 'SUPER_ADMIN' || actor.role === 'ADMIN') return true;

  const targetMembership = await prisma.workspaceMember.findFirst({
    where: { userId: targetUserId, workspaceId: actor.workspaceId, status: 'ACTIVE' }
  });
  if (!targetMembership) return false;

  if (targetMembership.role === 'SUPER_ADMIN' || targetMembership.role === 'ADMIN') return true;

  return await isProjectAdminInWorkspace(targetUserId, actor.workspaceId);
};

export const listDmTargetsForActor = async (actor: Actor) => {
  const userSelect = { select: authorSelect };

  if (actor.role === 'SUPER_ADMIN' || actor.role === 'ADMIN') {
    const rows = await prisma.workspaceMember.findMany({
      where: {
        workspaceId: actor.workspaceId,
        status: 'ACTIVE',
        userId: { not: actor.id }
      },
      include: { user: userSelect }
    });
    return rows.map(r => ({
      id: r.user.id,
      name: r.user.name || r.user.email,
      email: r.user.email,
      role: r.role as string,
      profilePic: r.user.profilePic || undefined
    }));
  }

  const [adminRows, projectAdminRows] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: {
        workspaceId: actor.workspaceId,
        status: 'ACTIVE',
        userId: { not: actor.id },
        role: { in: ['SUPER_ADMIN', 'ADMIN'] }
      },
      include: { user: userSelect }
    }),
    prisma.projectMember.findMany({
      where: {
        role: 'ADMIN',
        userId: { not: actor.id },
        project: { workspaceId: actor.workspaceId }
      },
      include: { user: userSelect }
    })
  ]);

  const byId = new Map<string, {
    id: string;
    name: string;
    email: string;
    role: string;
    profilePic?: string;
  }>();

  for (const row of adminRows) {
    byId.set(row.user.id, {
      id: row.user.id,
      name: row.user.name || row.user.email,
      email: row.user.email,
      role: row.role,
      profilePic: row.user.profilePic || undefined
    });
  }

  for (const row of projectAdminRows) {
    if (byId.has(row.user.id)) continue;
    byId.set(row.user.id, {
      id: row.user.id,
      name: row.user.name || row.user.email,
      email: row.user.email,
      role: 'MEMBER',
      profilePic: row.user.profilePic || undefined
    });
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
};

export const getOrCreateDirectConversation = async (
  actor: Actor,
  targetUserId: string
) => {
  const allowed = await canStartDmWith(actor, targetUserId);
  if (!allowed) {
    throw new Error('You can only message admins or project admins in your company');
  }

  const pairKey = dmPairKey(actor.id, targetUserId);
  let conversation = await prisma.directConversation.findUnique({
    where: { workspaceId_pairKey: { workspaceId: actor.workspaceId, pairKey } }
  });

  if (!conversation) {
    conversation = await prisma.directConversation.create({
      data: {
        workspaceId: actor.workspaceId,
        pairKey,
        createdById: actor.id,
        participants: {
          create: [{ userId: actor.id }, { userId: targetUserId }]
        }
      }
    });
  } else {
    for (const userId of [actor.id, targetUserId]) {
      await prisma.directParticipant.upsert({
        where: {
          conversationId_userId: { conversationId: conversation.id, userId }
        },
        create: { conversationId: conversation.id, userId },
        update: {}
      });
    }
  }

  return conversation;
};

export const isChannelMember = async (channelId: string, userId: string) => {
  const row = await prisma.channelMember.findUnique({
    where: { channelId_userId: { channelId, userId } }
  });
  return Boolean(row);
};

export const canPostToChannel = (actor: Actor) =>
  actor.role === 'SUPER_ADMIN' || actor.role === 'ADMIN';

export const canManageChannelMembers = async (actor: Actor, channel: {
  id: string;
  workspaceId: string;
  type: string;
  teamId: string | null;
  projectId: string | null;
}) => {
  if (actor.workspaceId !== channel.workspaceId) return false;
  if (actor.role === 'SUPER_ADMIN') return true;
  if (channel.type === 'DEPARTMENT' && actor.role === 'ADMIN' && actor.teamId === channel.teamId) {
    return true;
  }
  if (channel.type === 'PROJECT' && channel.projectId) {
    const pm = await getProjectMembership(channel.projectId, actor.id);
    if (pm?.role === 'ADMIN') return true;
    if (actor.role === 'ADMIN' && actor.teamId) {
      const project = await prisma.project.findUnique({ where: { id: channel.projectId } });
      if (project?.teamId === actor.teamId) return true;
    }
  }
  return false;
};

export const mapMessageForClient = (msg: {
  id: string;
  body: string;
  authorId: string;
  createdAt: Date;
  editedAt: Date | null;
  author: { id: string; name: string | null; email: string; profilePic: string | null };
}) => ({
  id: msg.id,
  body: msg.body,
  authorId: msg.authorId,
  authorName: msg.author.name || msg.author.email,
  authorProfilePic: msg.author.profilePic || undefined,
  createdAt: msg.createdAt.toISOString(),
  editedAt: msg.editedAt?.toISOString()
});

export const lastMessageInclude = {
  where: { deletedAt: null },
  orderBy: { createdAt: 'desc' as const },
  take: 1,
  include: { author: { select: authorSelect } }
};

export const fetchChannelsForActor = async (actor: Actor) => {
  await ensureActorChatMembership(actor);

  const memberships = await prisma.channelMember.findMany({
    where: { userId: actor.id, channel: { workspaceId: actor.workspaceId } },
    include: {
      channel: {
        include: {
          messages: lastMessageInclude
        }
      }
    }
  });

  const typeOrder = { WORKSPACE: 0, DEPARTMENT: 1, PROJECT: 2 };

  return memberships
    .map(m => m.channel)
    .sort((a, b) => {
      const ao = typeOrder[a.type as keyof typeof typeOrder] ?? 9;
      const bo = typeOrder[b.type as keyof typeof typeOrder] ?? 9;
      if (ao !== bo) return ao - bo;
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    });
};

export const fetchConversationsForActor = async (actor: Actor) => {
  const rows = await prisma.directParticipant.findMany({
    where: {
      userId: actor.id,
      conversation: { workspaceId: actor.workspaceId }
    },
    include: {
      conversation: {
        include: {
          participants: { include: { user: { select: authorSelect } } },
          messages: lastMessageInclude
        }
      }
    },
    orderBy: { conversation: { updatedAt: 'desc' } }
  });

  return rows.map(r => r.conversation);
};
