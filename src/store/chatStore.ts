import { create } from 'zustand';
import type {
  ChatChannel,
  ChatConversation,
  ChatMessage,
  DmTarget
} from '../types';

type ThreadKey = `channel:${string}` | `dm:${string}`;

interface ThreadCacheEntry {
  messages: ChatMessage[];
  hasMore: boolean;
}

interface ChatState {
  channels: ChatChannel[];
  conversations: ChatConversation[];
  dmTargets: DmTarget[];
  messages: ChatMessage[];
  hasMoreMessages: boolean;
  messagesByThread: Record<ThreadKey, ThreadCacheEntry>;
  activeKind: 'channel' | 'dm' | null;
  activeId: string | null;
  loading: boolean;
  sidebarLoading: boolean;
  channelsLoading: boolean;
  conversationsLoading: boolean;
  sending: boolean;
  error: string | null;

  reset: () => void;
  bootstrap: () => Promise<void>;
  fetchChannels: () => Promise<void>;
  fetchConversations: () => Promise<void>;
  fetchDmTargets: () => Promise<void>;
  selectChannel: (channelId: string) => Promise<void>;
  selectConversation: (conversationId: string) => Promise<void>;
  clearActive: () => void;
  startDm: (targetUserId: string) => Promise<ChatConversation>;
  sendMessage: (body: string) => Promise<boolean>;
  loadOlderMessages: () => Promise<void>;
  refreshSidebar: () => Promise<void>;
  refreshActiveMessages: () => Promise<void>;
}

const getToken = () => localStorage.getItem('token');

const authHeaders = () => ({
  Authorization: `Bearer ${getToken()}`,
  'Content-Type': 'application/json'
});

const throwOnError = async (res: Response, fallback: string) => {
  if (res.ok) return;
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error || fallback);
};

const emptyState = {
  channels: [] as ChatChannel[],
  conversations: [] as ChatConversation[],
  dmTargets: [] as DmTarget[],
  messages: [] as ChatMessage[],
  hasMoreMessages: false,
  messagesByThread: {} as Record<ThreadKey, ThreadCacheEntry>,
  activeKind: null as 'channel' | 'dm' | null,
  activeId: null as string | null,
  loading: false,
  sidebarLoading: false,
  channelsLoading: false,
  conversationsLoading: false,
  sending: false,
  error: null as string | null
};

const threadKey = (kind: 'channel' | 'dm', id: string): ThreadKey =>
  kind === 'channel' ? `channel:${id}` : `dm:${id}`;

const mergeMessages = (existing: ChatMessage[], incoming: ChatMessage[]) => {
  if (incoming.length === 0) return existing;
  const byId = new Map(existing.map(m => [m.id, m]));
  for (const msg of incoming) byId.set(msg.id, msg);
  return [...byId.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
};

const patchSidebarPreview = (
  channels: ChatChannel[],
  conversations: ChatConversation[],
  message: ChatMessage,
  activeKind: 'channel' | 'dm' | null,
  activeId: string | null
) => {
  const preview = {
    body: message.body,
    createdAt: message.createdAt,
    authorName: message.authorName
  };

  if (activeKind === 'channel' && activeId) {
    return {
      channels: channels.map(ch =>
        ch.id === activeId ? { ...ch, lastMessage: preview } : ch
      ),
      conversations
    };
  }

  if (activeKind === 'dm' && activeId) {
    return {
      channels,
      conversations: conversations.map(c =>
        c.id === activeId
          ? { ...c, lastMessage: preview, updatedAt: message.createdAt }
          : c
      )
    };
  }

  return { channels, conversations };
};

const rememberThread = (
  messagesByThread: Record<ThreadKey, ThreadCacheEntry>,
  key: ThreadKey,
  messages: ChatMessage[],
  hasMore: boolean
) => ({
  ...messagesByThread,
  [key]: { messages, hasMore }
});

export const useChatStore = create<ChatState>((set, get) => ({
  ...emptyState,

  reset: () => set(emptyState),

  /**
   * Progressive sidebar load: channels and conversations fetch in parallel.
   * Whichever finishes first is painted immediately; the other fills in after.
   */
  bootstrap: async () => {
    set({
      sidebarLoading: true,
      channelsLoading: true,
      conversationsLoading: true,
      error: null
    });

    const loadChannels = (async () => {
      try {
        const res = await fetch('/api/chat/channels', { headers: authHeaders() });
        await throwOnError(res, 'Failed to load channels');
        const channels = await res.json();
        set({ channels, channelsLoading: false });
      } catch (e: any) {
        set({
          channelsLoading: false,
          error: e.message || 'Failed to load channels'
        });
      }
    })();

    const loadConversations = (async () => {
      try {
        const res = await fetch('/api/chat/conversations', { headers: authHeaders() });
        await throwOnError(res, 'Failed to load conversations');
        const conversations = await res.json();
        set({ conversations, conversationsLoading: false });
      } catch (e: any) {
        set({
          conversationsLoading: false,
          error: e.message || 'Failed to load conversations'
        });
      }
    })();

    await Promise.allSettled([loadChannels, loadConversations]);
    set({ sidebarLoading: false });
  },

  fetchChannels: async () => {
    const res = await fetch('/api/chat/channels', { headers: authHeaders() });
    await throwOnError(res, 'Failed to load channels');
    const channels = await res.json();
    set({ channels, channelsLoading: false });
  },

  fetchConversations: async () => {
    const res = await fetch('/api/chat/conversations', { headers: authHeaders() });
    await throwOnError(res, 'Failed to load conversations');
    const conversations = await res.json();
    set({ conversations, conversationsLoading: false });
  },

  fetchDmTargets: async () => {
    const res = await fetch('/api/chat/dm-targets', { headers: authHeaders() });
    await throwOnError(res, 'Failed to load DM targets');
    const dmTargets = await res.json();
    set({ dmTargets });
  },

  refreshSidebar: async () => {
    try {
      const [chRes, dmRes] = await Promise.all([
        fetch('/api/chat/channels', { headers: authHeaders() }),
        fetch('/api/chat/conversations', { headers: authHeaders() })
      ]);
      if (chRes.ok) {
        const channels = await chRes.json();
        set({ channels });
      }
      if (dmRes.ok) {
        const conversations = await dmRes.json();
        set({ conversations });
      }
    } catch {
      /* background refresh — ignore */
    }
  },

  refreshActiveMessages: async () => {
    const { activeKind, activeId, messages, loading, messagesByThread } = get();
    if (!activeKind || !activeId || loading) return;

    const last = messages[messages.length - 1];
    const afterParam = last ? `?after=${encodeURIComponent(last.id)}&limit=50` : '';

    const url =
      activeKind === 'channel'
        ? `/api/chat/channels/${activeId}/messages${afterParam}`
        : `/api/chat/conversations/${activeId}/messages${afterParam}`;

    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) return;

    const data = await res.json();
    if (data.messages?.length) {
      const key = threadKey(activeKind, activeId);
      set(state => {
        const nextMessages = last
          ? mergeMessages(state.messages, data.messages)
          : data.messages;
        return {
          messages: nextMessages,
          messagesByThread: rememberThread(
            state.messagesByThread,
            key,
            nextMessages,
            state.hasMoreMessages
          )
        };
      });
    } else if (!last && data.messages) {
      const key = threadKey(activeKind, activeId);
      set(state => ({
        messages: data.messages,
        hasMoreMessages: data.hasMore,
        messagesByThread: rememberThread(
          messagesByThread,
          key,
          data.messages,
          Boolean(data.hasMore)
        )
      }));
    }
  },

  selectChannel: async (channelId: string) => {
    const { activeId, activeKind, messagesByThread } = get();
    if (activeKind === 'channel' && activeId === channelId) return;

    const key = threadKey('channel', channelId);
    const cached = messagesByThread[key];

    set({
      loading: !cached,
      error: null,
      activeKind: 'channel',
      activeId: channelId,
      messages: cached?.messages ?? [],
      hasMoreMessages: cached?.hasMore ?? false
    });

    try {
      const res = await fetch(`/api/chat/channels/${channelId}/messages`, {
        headers: authHeaders()
      });
      await throwOnError(res, 'Failed to load messages');
      const data = await res.json();
      // Ignore stale responses if the user switched threads mid-flight.
      if (get().activeKind !== 'channel' || get().activeId !== channelId) return;
      set(state => ({
        messages: data.messages,
        hasMoreMessages: data.hasMore,
        loading: false,
        messagesByThread: rememberThread(
          state.messagesByThread,
          key,
          data.messages,
          Boolean(data.hasMore)
        )
      }));
    } catch (e: any) {
      if (get().activeKind !== 'channel' || get().activeId !== channelId) return;
      set({ loading: false, error: e.message || 'Failed to load messages' });
    }
  },

  selectConversation: async (conversationId: string) => {
    const { activeId, activeKind, messagesByThread } = get();
    if (activeKind === 'dm' && activeId === conversationId) return;

    const key = threadKey('dm', conversationId);
    const cached = messagesByThread[key];

    set({
      loading: !cached,
      error: null,
      activeKind: 'dm',
      activeId: conversationId,
      messages: cached?.messages ?? [],
      hasMoreMessages: cached?.hasMore ?? false
    });

    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
        headers: authHeaders()
      });
      await throwOnError(res, 'Failed to load messages');
      const data = await res.json();
      if (get().activeKind !== 'dm' || get().activeId !== conversationId) return;
      set(state => ({
        messages: data.messages,
        hasMoreMessages: data.hasMore,
        loading: false,
        messagesByThread: rememberThread(
          state.messagesByThread,
          key,
          data.messages,
          Boolean(data.hasMore)
        )
      }));
    } catch (e: any) {
      if (get().activeKind !== 'dm' || get().activeId !== conversationId) return;
      set({ loading: false, error: e.message || 'Failed to load messages' });
    }
  },

  clearActive: () => {
    set({
      activeKind: null,
      activeId: null,
      messages: [],
      hasMoreMessages: false,
      loading: false,
      error: null
    });
  },

  startDm: async (targetUserId: string) => {
    const res = await fetch('/api/chat/conversations', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ targetUserId })
    });
    await throwOnError(res, 'Could not start conversation');
    const conversation = await res.json();
    set(state => ({
      conversations: [
        conversation,
        ...state.conversations.filter(c => c.id !== conversation.id)
      ]
    }));
    await get().selectConversation(conversation.id);
    return conversation;
  },

  sendMessage: async (body: string) => {
    const { activeKind, activeId, channels, conversations } = get();
    if (!activeKind || !activeId || !body.trim()) return false;

    set({ sending: true, error: null });
    try {
      const url =
        activeKind === 'channel'
          ? `/api/chat/channels/${activeId}/messages`
          : `/api/chat/conversations/${activeId}/messages`;

      const res = await fetch(url, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ body: body.trim() })
      });
      await throwOnError(res, 'Failed to send message');
      const message = await res.json();

      const patched = patchSidebarPreview(channels, conversations, message, activeKind, activeId);
      const key = threadKey(activeKind, activeId);
      set(state => {
        const nextMessages = [...state.messages, message];
        return {
          messages: nextMessages,
          sending: false,
          channels: patched.channels,
          conversations: patched.conversations,
          messagesByThread: rememberThread(
            state.messagesByThread,
            key,
            nextMessages,
            state.hasMoreMessages
          )
        };
      });
      return true;
    } catch (e: any) {
      set({ sending: false, error: e.message || 'Failed to send message' });
      return false;
    }
  },

  loadOlderMessages: async () => {
    const { activeKind, activeId, messages, hasMoreMessages, loading } = get();
    if (!activeKind || !activeId || !hasMoreMessages || loading || messages.length === 0) return;

    const oldest = messages[0];
    const base =
      activeKind === 'channel'
        ? `/api/chat/channels/${activeId}/messages`
        : `/api/chat/conversations/${activeId}/messages`;

    set({ loading: true });
    try {
      const res = await fetch(`${base}?before=${encodeURIComponent(oldest.id)}`, {
        headers: authHeaders()
      });
      await throwOnError(res, 'Failed to load older messages');
      const data = await res.json();
      const key = threadKey(activeKind, activeId);
      set(state => {
        const nextMessages = mergeMessages(data.messages, state.messages);
        return {
          messages: nextMessages,
          hasMoreMessages: data.hasMore,
          loading: false,
          messagesByThread: rememberThread(
            state.messagesByThread,
            key,
            nextMessages,
            Boolean(data.hasMore)
          )
        };
      });
    } catch (e: any) {
      set({ loading: false, error: e.message || 'Failed to load older messages' });
    }
  }
}));
