import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, MessageSquare, AlertCircle, RefreshCw, FileText, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotificationStore } from '../store/notificationStore';
import type { AppNotification } from '../types';
import { EmptyState } from '../components/common/EmptyState';

export const InboxPage: React.FC = () => {
  const navigate = useNavigate();
  const { notifications, fetchNotifications, markAsRead, markAllAsRead } = useNotificationStore();
  const [filter, setFilter] = useState<'All' | 'Unread' | 'Read'>('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications().finally(() => setLoading(false));
  }, [fetchNotifications]);

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'Unread') return !n.read;
    if (filter === 'Read') return n.read;
    return true;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const getIcon = (type: string) => {
    switch (type) {
      case 'task_assigned':
        return <FileText size={18} style={{ color: 'var(--primary)' }} />;
      case 'task_completed':
        return <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />;
      case 'comment_mention':
        return <MessageSquare size={18} style={{ color: 'var(--accent)' }} />;
      case 'project_update':
        return <RefreshCw size={18} style={{ color: 'var(--info)' }} />;
      case 'deadline_reminder':
        return <AlertCircle size={18} style={{ color: 'var(--warning)' }} />;
      default:
        return <Bell size={18} style={{ color: 'var(--text-muted)' }} />;
    }
  };

  const getTimeAgo = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  const handleClick = async (notification: AppNotification) => {
    if (!notification.read) await markAsRead(notification.id);
    if (notification.targetType === 'task' && notification.targetId) {
      const { useWorkspaceStore } = await import('../store/workspaceStore');
      const task = useWorkspaceStore.getState().tasks.find(t => t.id === notification.targetId);
      if (task?.projectId) navigate(`/projects/${task.projectId}`);
    } else if (notification.targetType === 'project' && notification.targetId) {
      navigate(`/projects/${notification.targetId}`);
    }
  };

  return (
    <div className="page-content" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <header
        className="page-header"
        style={{
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap'
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 600,
              margin: '0 0 0.25rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--text-primary)'
            }}
          >
            <Bell size={22} style={{ color: 'var(--primary)' }} /> Inbox
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>
            {unreadCount > 0 ? `${unreadCount} unread` : 'You are caught up'}
          </p>
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          style={{ fontSize: '0.875rem' }}
          onClick={() => markAllAsRead()}
          disabled={unreadCount === 0}
        >
          <Check size={16} /> Mark all as read
        </button>
      </header>

      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '1rem',
          marginBottom: '1.25rem'
        }}
      >
        {(['All', 'Unread', 'Read'] as const).map(f => {
          const isSelected = filter === f;
          return (
            <button
              key={f}
              type="button"
              style={{
                padding: '0.375rem 1rem',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.875rem',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                backgroundColor: isSelected ? 'var(--primary-alpha)' : 'transparent',
                color: isSelected ? 'var(--primary)' : 'var(--text-muted)'
              }}
              onClick={() => setFilter(f)}
            >
              {f} {f === 'Unread' && unreadCount > 0 && `(${unreadCount})`}
            </button>
          );
        })}
      </div>

      <div className="card-panel" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
        ) : (
          <AnimatePresence>
            {filteredNotifications.length > 0 ? (
              filteredNotifications.map((notification, index) => (
                <motion.div
                  key={notification.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.2) }}
                  style={{
                    display: 'flex',
                    gap: '1rem',
                    padding: '1rem 1.5rem',
                    borderBottom: '1px solid var(--border-color)',
                    cursor: 'pointer',
                    position: 'relative',
                    backgroundColor: !notification.read ? 'var(--primary-alpha)' : 'transparent',
                    borderLeft: !notification.read ? '3px solid var(--primary)' : '3px solid transparent'
                  }}
                  onClick={() => handleClick(notification)}
                >
                  <div
                    style={{
                      flexShrink: 0,
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--bg-surface)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid var(--border-color)',
                      marginTop: '0.25rem'
                    }}
                  >
                    {getIcon(notification.type)}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '0.25rem'
                      }}
                    >
                      <h4
                        style={{
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          margin: 0,
                          color: !notification.read ? 'var(--primary)' : 'var(--text-primary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          paddingRight: '1rem'
                        }}
                      >
                        {notification.title}
                      </h4>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {getTimeAgo(notification.createdAt)}
                      </span>
                    </div>
                    <p
                      style={{
                        fontSize: '0.875rem',
                        color: 'var(--text-muted)',
                        margin: 0,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}
                    >
                      {notification.description}
                    </p>
                  </div>
                </motion.div>
              ))
            ) : (
              <EmptyState
                icon={Bell}
                title={filter === 'Unread' ? 'No unread notifications' : "You're all caught up"}
                description={
                  filter === 'All'
                    ? 'Mentions, assignments, and updates will land here.'
                    : `No ${filter.toLowerCase()} notifications right now.`
                }
              />
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};
