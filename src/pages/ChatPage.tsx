import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Hash,
  Lock,
  MessageCircle,
  Plus,
  Send,
  Users,
  Building2,
  FolderKanban,
  ArrowLeft
} from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { Avatar } from '../components/common/Avatar';
import type { ChannelType, ChatChannel } from '../types';
import '../components/chat/chat.css';

const MESSAGE_POLL_MS = 8000;
const SIDEBAR_POLL_MS = 30000;

const channelIcon = (type: ChannelType) => {
  switch (type) {
    case 'WORKSPACE':
      return <Building2 size={14} />;
    case 'DEPARTMENT':
      return <Users size={14} />;
    case 'PROJECT':
      return <FolderKanban size={14} />;
    default:
      return <Hash size={14} />;
  }
};

const formatChannelLabel = (channel: ChatChannel) => {
  if (channel.type === 'WORKSPACE' && channel.isDefault) return `#${channel.name}`;
  if (channel.type === 'DEPARTMENT') return channel.name;
  return `#${channel.name}`;
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export const ChatPage: React.FC = () => {
  const { user } = useAuthStore();
  const {
    channels,
    conversations,
    dmTargets,
    messages,
    hasMoreMessages,
    activeKind,
    activeId,
    loading,
    channelsLoading,
    conversationsLoading,
    sending,
    error,
    bootstrap,
    fetchDmTargets,
    selectChannel,
    selectConversation,
    startDm,
    sendMessage,
    loadOlderMessages,
    refreshSidebar,
    refreshActiveMessages,
    clearActive
  } = useChatStore();

  const [draft, setDraft] = useState('');
  const [showDmModal, setShowDmModal] = useState(false);
  const [dmSearch, setDmSearch] = useState('');
  const [startingDm, setStartingDm] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);

  useEffect(() => {
    bootstrap();
    const messageTimer = window.setInterval(refreshActiveMessages, MESSAGE_POLL_MS);
    const sidebarTimer = window.setInterval(refreshSidebar, SIDEBAR_POLL_MS);
    return () => {
      window.clearInterval(messageTimer);
      window.clearInterval(sidebarTimer);
    };
  }, [bootstrap, refreshActiveMessages, refreshSidebar]);

  useEffect(() => {
    if (channels.length === 0 || activeId) return;
    // On desktop, auto-open general; on mobile keep list-first.
    if (window.matchMedia('(max-width: 900px)').matches) return;
    const general =
      channels.find(c => c.type === 'WORKSPACE' && c.isDefault) ||
      channels.find(c => c.type === 'WORKSPACE');
    if (general) selectChannel(general.id);
  }, [channels, activeId, selectChannel]);

  useEffect(() => {
    stickToBottomRef.current = true;
    prevMessageCountRef.current = 0;
    setDraft('');
  }, [activeId]);

  useEffect(() => {
    const grew = messages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    if (!grew || !stickToBottomRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeId]);

  const handleMessagesScroll = () => {
    const el = messagesRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;
  };

  const groupedChannels = useMemo(() => ({
    workspace: channels.filter(c => c.type === 'WORKSPACE'),
    department: channels.filter(c => c.type === 'DEPARTMENT'),
    project: channels.filter(c => c.type === 'PROJECT')
  }), [channels]);

  const activeTitle = useMemo(() => {
    if (activeKind === 'channel') {
      const ch = channels.find(c => c.id === activeId);
      return ch ? formatChannelLabel(ch) : 'Channel';
    }
    if (activeKind === 'dm') {
      const conv = conversations.find(c => c.id === activeId);
      return conv?.otherUserName || 'Direct message';
    }
    return 'Chat';
  }, [activeKind, activeId, channels, conversations]);

  const activeSubtitle = useMemo(() => {
    if (activeKind === 'channel') {
      const ch = channels.find(c => c.id === activeId);
      if (!ch) return '';
      if (ch.type === 'WORKSPACE') return 'Company-wide channel';
      if (ch.type === 'DEPARTMENT') return 'Department channel';
      return 'Project channel';
    }
    if (activeKind === 'dm') return 'Direct message';
    return '';
  }, [activeKind, activeId, channels]);

  const canPostInChannels = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  const channelReadOnly = activeKind === 'channel' && !canPostInChannels;

  const handleOpenDmModal = async () => {
    setShowDmModal(true);
    setDmSearch('');
    try {
      await fetchDmTargets();
    } catch {
      /* store sets error */
    }
  };

  const filteredTargets = dmTargets.filter(t =>
    t.name.toLowerCase().includes(dmSearch.toLowerCase()) ||
    t.email.toLowerCase().includes(dmSearch.toLowerCase())
  );

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!draft.trim() || sending) return;
    const text = draft;
    setDraft('');
    stickToBottomRef.current = true;
    const ok = await sendMessage(text);
    if (!ok) setDraft(text);
  };

  const renderChannelGroup = (label: string, items: ChatChannel[]) => {
    if (items.length === 0) return null;
    return (
      <>
        <div className="chat-section-label">{label}</div>
        {items.map(channel => (
          <button
            key={channel.id}
            type="button"
            className={`chat-thread-item ${activeKind === 'channel' && activeId === channel.id ? 'active' : ''}`}
            onClick={() => selectChannel(channel.id)}
          >
            <div className="chat-thread-title">
              {channelIcon(channel.type)}
              <span>{formatChannelLabel(channel)}</span>
            </div>
            {channel.lastMessage && (
              <div className="chat-thread-preview">
                {channel.lastMessage.authorName}: {channel.lastMessage.body}
              </div>
            )}
          </button>
        ))}
      </>
    );
  };

  return (
    <div className={`chat-page ${activeId ? 'chat-page--thread-open' : ''}`}>
      <aside className="chat-sidebar">
        <div className="chat-sidebar-header">
          <h1>Chat</h1>
          <p>Company channels and direct messages</p>
        </div>

        <div className="chat-sidebar-scroll">
          {channelsLoading && channels.length === 0 && (
            <div className="chat-sidebar-hint">Loading channels…</div>
          )}
          {renderChannelGroup('Company', groupedChannels.workspace)}
          {renderChannelGroup('Departments', groupedChannels.department)}
          {renderChannelGroup('Projects', groupedChannels.project)}
          {!channelsLoading && channels.length === 0 && (
            <div className="chat-sidebar-hint">No channels yet</div>
          )}

          <div className="chat-section-label">Direct messages</div>
          {conversationsLoading && conversations.length === 0 && (
            <div className="chat-sidebar-hint">Loading conversations…</div>
          )}
          {!conversationsLoading && conversations.length === 0 && (
            <div className="chat-sidebar-hint">No conversations yet</div>
          )}
          {conversations.map(conv => (
            <button
              key={conv.id}
              type="button"
              className={`chat-thread-item ${activeKind === 'dm' && activeId === conv.id ? 'active' : ''}`}
              onClick={() => selectConversation(conv.id)}
            >
              <div className="chat-thread-title">
                <MessageCircle size={14} />
                <span>{conv.otherUserName}</span>
              </div>
              {conv.lastMessage && (
                <div className="chat-thread-preview">
                  {conv.lastMessage.authorName}: {conv.lastMessage.body}
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="chat-new-dm">
          <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={handleOpenDmModal}>
            <Plus size={16} />
            New message
          </button>
        </div>
      </aside>

      <section className="chat-main">
        {!activeId ? (
          <div className="chat-empty">
            <MessageCircle size={40} />
            <p>Select a channel or start a direct message</p>
          </div>
        ) : (
          <>
            <header className="chat-main-header">
              <button
                type="button"
                className="chat-back-btn"
                aria-label="Back to conversations"
                onClick={() => clearActive()}
              >
                <ArrowLeft size={18} />
              </button>
              <div className="chat-main-header-text">
                <h2>{activeTitle}</h2>
                <span>{activeSubtitle}</span>
              </div>
            </header>

            <div className="chat-messages" ref={messagesRef} onScroll={handleMessagesScroll}>
              {hasMoreMessages && (
                <button
                  type="button"
                  className="btn btn-ghost chat-load-more"
                  onClick={() => {
                    stickToBottomRef.current = false;
                    loadOlderMessages();
                  }}
                  disabled={loading}
                >
                  Load older messages
                </button>
              )}

              {loading && messages.length === 0 && <div className="chat-empty">Loading messages…</div>}
              {!loading && messages.length === 0 && (
                <div className="chat-empty">
                  <p>{channelReadOnly ? 'No messages yet.' : 'No messages yet. Say hello!'}</p>
                </div>
              )}

              {messages.map(msg => {
                const isOwn = msg.authorId === user?.id;
                return (
                  <div key={msg.id} className={`chat-message ${isOwn ? 'own' : ''}`}>
                    <Avatar name={msg.authorName} src={msg.authorProfilePic} size="sm" />
                    <div className="chat-message-bubble">
                      <div className="chat-message-meta">
                        {!isOwn && <strong>{msg.authorName}</strong>}
                        {!isOwn && ' · '}
                        {formatTime(msg.createdAt)}
                      </div>
                      <div className="chat-message-body">{msg.body}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {error && <div className="chat-error">{error}</div>}

            {channelReadOnly ? (
              <div className="chat-composer chat-composer-locked">
                <Lock size={16} />
                <span>Channels are read-only for members. Use direct messages to reach admins.</span>
              </div>
            ) : (
              <form className="chat-composer" onSubmit={handleSend}>
                <textarea
                  className="input"
                  placeholder="Write a message… (Enter to send)"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  rows={1}
                />
                <button type="submit" className="btn btn-primary" disabled={!draft.trim() || sending} aria-label="Send">
                  <Send size={18} />
                </button>
              </form>
            )}
          </>
        )}
      </section>

      {showDmModal && (
        <div className="chat-dm-modal-backdrop" onClick={() => !startingDm && setShowDmModal(false)}>
          <div className="chat-dm-modal" onClick={e => e.stopPropagation()}>
            <h3>New direct message</h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {user?.role === 'MEMBER'
                ? 'Members can message workspace admins and project admins.'
                : 'Message anyone in your workspace.'}
            </p>
            <input
              className="input"
              placeholder="Search people…"
              value={dmSearch}
              onChange={e => setDmSearch(e.target.value)}
              style={{ width: '100%', marginBottom: '0.75rem' }}
              autoFocus
            />
            <div className="chat-dm-modal-list">
              {filteredTargets.length === 0 && (
                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No eligible contacts
                </div>
              )}
              {filteredTargets.map(target => (
                <button
                  key={target.id}
                  type="button"
                  className="chat-dm-target"
                  disabled={startingDm}
                  onClick={async () => {
                    setStartingDm(true);
                    try {
                      await startDm(target.id);
                      setShowDmModal(false);
                    } finally {
                      setStartingDm(false);
                    }
                  }}
                >
                  <Avatar name={target.name} src={target.profilePic} size="sm" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{target.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{target.email}</div>
                  </div>
                  <span className="chat-type-badge">{target.role.replace('_', ' ').toLowerCase()}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
