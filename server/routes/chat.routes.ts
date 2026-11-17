import { Router } from 'express';
import { prisma } from '../index';
import { authenticate } from './auth.routes';
import { requireFeature } from '../middleware/entitlements';
import {
  addChannelMemberByAdmin,
  authorSelect,
  canManageChannelMembers,
  canPostToChannel,
  fetchChannelsForActor,
  fetchConversationsForActor,
  getOrCreateDirectConversation,
  isChannelMember,
  listDmTargetsForActor,
  mapMessageForClient
} from '../chat.service';

const router = Router();
router.use(authenticate);
router.use(requireFeature('chat'));


const DEFAULT_LIMIT = 50;

const mapChannelForClient = (channel: {
  id: string;
  type: string;
  name: string;
  teamId: string | null;
  projectId: string | null;
  isDefault: boolean;
  messages?: { body: string; createdAt: Date; author: { name: string | null; email: string } }[];
}) => {
  const last = channel.messages?.[0];
  return {
    id: channel.id,
    type: channel.type,
    name: channel.name,
    teamId: channel.teamId || undefined,
    projectId: channel.projectId || undefined,
    isDefault: channel.isDefault,
    lastMessage: last
      ? {
          body: last.body,
          createdAt: last.createdAt.toISOString(),
          authorName: last.author.name || last.author.email
        }
      : undefined
  };
};

const mapConversationForClient = (
  conversation: {
    id: string;
    updatedAt: Date;
    participants: {
      userId: string;
      user: { id: string; name: string | null; email: string; profilePic: string | null };
    }[];
    messages?: { body: string; createdAt: Date; author: { name: string | null; email: string } }[];
  },
  actorId: string
) => {
  const other = conversation.participants.find(p => p.userId !== actorId)?.user;
  const last = conversation.messages?.[0];
  return {
    id: conversation.id,
    otherUserId: other?.id,
    otherUserName: other?.name || other?.email,
    otherUserProfilePic: other?.profilePic || undefined,
    updatedAt: conversation.updatedAt.toISOString(),
    lastMessage: last
      ? {
          body: last.body,
          createdAt: last.createdAt.toISOString(),
          authorName: last.author.name || last.author.email
        }
      : undefined
  };
};

const fetchMessages = async (opts: {
  where: Record<string, unknown>;
  before?: string;
  after?: string;
  limit: number;
}) => {
  const { where, before, after, limit } = opts;

  if (after && typeof after === 'string') {
    const cursorMsg = await prisma.message.findFirst({
      where: { id: after, deletedAt: null }
    });
    if (!cursorMsg) {
      return { messages: [], hasMore: false };
    }
    const messages = await prisma.message.findMany({
      where: {
        ...where,
        deletedAt: null,
        createdAt: { gt: cursorMsg.createdAt }
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: { author: { select: authorSelect } }
    });
    return { messages: messages.map(mapMessageForClient), hasMore: false };
  }

  let cursorDate: Date | undefined;
  if (before && typeof before === 'string') {
    const cursorMsg = await prisma.message.findFirst({
      where: { id: before, deletedAt: null }
    });
    if (cursorMsg) cursorDate = cursorMsg.createdAt;
  }

  const messages = await prisma.message.findMany({
    where: {
      ...where,
      deletedAt: null,
      ...(cursorDate ? { createdAt: { lt: cursorDate } } : {})
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { author: { select: authorSelect } }
  });

  return {
    messages: messages.reverse().map(mapMessageForClient),
    hasMore: messages.length === limit
  };
};

/** Single round-trip for sidebar — channels + DMs together. */
router.get('/bootstrap', async (req: any, res) => {
  try {
    const actor = req.actor;
    const [channelRows, conversationRows] = await Promise.all([
      fetchChannelsForActor(actor),
      fetchConversationsForActor(actor)
    ]);

    res.json({
      channels: channelRows.map(mapChannelForClient),
      conversations: conversationRows.map(c => mapConversationForClient(c, actor.id))
    });
  } catch (error) {
    console.error('Chat bootstrap error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/channels', async (req: any, res) => {
  try {
    const actor = req.actor;
    const channelRows = await fetchChannelsForActor(actor);
    res.json(channelRows.map(mapChannelForClient));
  } catch (error) {
    console.error('List channels error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/channels/:channelId/messages', async (req: any, res) => {
  try {
    const { channelId } = req.params;
    const { before, after, limit: limitRaw } = req.query;
    const actor = req.actor;
    const limit = Math.min(Number(limitRaw) || DEFAULT_LIMIT, 100);

    const channel = await prisma.channel.findFirst({
      where: { id: channelId, workspaceId: actor.workspaceId }
    });
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    if (!(await isChannelMember(channelId, actor.id))) {
      return res.status(403).json({ error: 'Not a member of this channel' });
    }

    const data = await fetchMessages({
      where: { channelId },
      before: typeof before === 'string' ? before : undefined,
      after: typeof after === 'string' ? after : undefined,
      limit
    });

    res.json(data);
  } catch (error) {
    console.error('Channel messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/channels/:channelId/messages', async (req: any, res) => {
  try {
    const { channelId } = req.params;
    const { body } = req.body || {};
    const actor = req.actor;
    const text = typeof body === 'string' ? body.trim() : '';

    if (!text) return res.status(400).json({ error: 'Message body is required' });

    const channel = await prisma.channel.findFirst({
      where: { id: channelId, workspaceId: actor.workspaceId }
    });
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    if (!(await isChannelMember(channelId, actor.id))) {
      return res.status(403).json({ error: 'Not a member of this channel' });
    }
    if (!canPostToChannel(actor)) {
      return res.status(403).json({ error: 'Only admins can post in channels' });
    }

    const message = await prisma.message.create({
      data: {
        workspaceId: actor.workspaceId,
        channelId,
        authorId: actor.id,
        body: text
      },
      include: { author: { select: authorSelect } }
    });

    await prisma.channel.update({
      where: { id: channelId },
      data: { updatedAt: new Date() }
    });

    res.status(201).json(mapMessageForClient(message));
  } catch (error) {
    console.error('Send channel message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/channels/:channelId/members', async (req: any, res) => {
  try {
    const { channelId } = req.params;
    const { userId } = req.body || {};
    const actor = req.actor;

    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const channel = await prisma.channel.findFirst({
      where: { id: channelId, workspaceId: actor.workspaceId }
    });
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    if (channel.type !== 'PROJECT') {
      return res.status(400).json({ error: 'Only project channels support adding extra members' });
    }
    if (!(await canManageChannelMembers(actor, channel))) {
      return res.status(403).json({ error: 'Not allowed to manage this channel' });
    }

    await addChannelMemberByAdmin(channelId, userId, actor.workspaceId);
    res.status(201).json({ ok: true });
  } catch (error: any) {
    console.error('Add channel member error:', error);
    res.status(400).json({ error: error.message || 'Could not add member' });
  }
});

router.get('/conversations', async (req: any, res) => {
  try {
    const actor = req.actor;
    const rows = await fetchConversationsForActor(actor);
    res.json(rows.map(c => mapConversationForClient(c, actor.id)));
  } catch (error) {
    console.error('List conversations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/conversations', async (req: any, res) => {
  try {
    const { targetUserId } = req.body || {};
    const actor = req.actor;

    if (!targetUserId) return res.status(400).json({ error: 'targetUserId is required' });

    const conversation = await getOrCreateDirectConversation(actor, targetUserId);
    const full = await prisma.directConversation.findUnique({
      where: { id: conversation.id },
      include: {
        participants: { include: { user: { select: authorSelect } } },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { author: { select: authorSelect } }
        }
      }
    });

    res.status(201).json(mapConversationForClient(full!, actor.id));
  } catch (error: any) {
    console.error('Start conversation error:', error);
    res.status(403).json({ error: error.message || 'Cannot start conversation' });
  }
});

router.get('/conversations/:conversationId/messages', async (req: any, res) => {
  try {
    const { conversationId } = req.params;
    const { before, after, limit: limitRaw } = req.query;
    const actor = req.actor;
    const limit = Math.min(Number(limitRaw) || DEFAULT_LIMIT, 100);

    const participant = await prisma.directParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId: actor.id }
      },
      include: { conversation: true }
    });
    if (!participant || participant.conversation.workspaceId !== actor.workspaceId) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const data = await fetchMessages({
      where: { conversationId },
      before: typeof before === 'string' ? before : undefined,
      after: typeof after === 'string' ? after : undefined,
      limit
    });

    res.json(data);
  } catch (error) {
    console.error('Conversation messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/conversations/:conversationId/messages', async (req: any, res) => {
  try {
    const { conversationId } = req.params;
    const { body } = req.body || {};
    const actor = req.actor;
    const text = typeof body === 'string' ? body.trim() : '';

    if (!text) return res.status(400).json({ error: 'Message body is required' });

    const participant = await prisma.directParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId: actor.id }
      },
      include: { conversation: true }
    });
    if (!participant || participant.conversation.workspaceId !== actor.workspaceId) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const message = await prisma.message.create({
      data: {
        workspaceId: actor.workspaceId,
        conversationId,
        authorId: actor.id,
        body: text
      },
      include: { author: { select: authorSelect } }
    });

    await prisma.directConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() }
    });

    res.status(201).json(mapMessageForClient(message));
  } catch (error) {
    console.error('Send DM error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/dm-targets', async (req: any, res) => {
  try {
    const targets = await listDmTargetsForActor(req.actor);
    res.json(targets);
  } catch (error) {
    console.error('DM targets error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
