import { create } from 'zustand';
import type { AppNotification } from '../types';

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  fetchNotifications: () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  reset: () => void;
}

const getToken = () => localStorage.getItem('token');

const throwOnError = async (res: Response, fallback: string) => {
  if (res.ok) return;
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error || fallback);
};

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,

  reset: () => set({ notifications: [], unreadCount: 0 }),

  fetchNotifications: async () => {
    const token = getToken();
    if (!token) return;
    const res = await fetch('/api/notifications', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;
    const notifications: AppNotification[] = await res.json();
    set({
      notifications,
      unreadCount: notifications.filter(n => !n.read).length
    });
  },

  fetchUnreadCount: async () => {
    const token = getToken();
    if (!token) return;
    const res = await fetch('/api/notifications/unread-count', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;
    const { count } = await res.json();
    set({ unreadCount: count });
  },

  markAsRead: async id => {
    const token = getToken();
    const wasUnread = get().notifications.find(n => n.id === id)?.read === false;
    const res = await fetch(`/api/notifications/${id}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` }
    });
    await throwOnError(res, 'Failed to mark notification as read');
    const updated: AppNotification = await res.json();
    set(state => ({
      notifications: state.notifications.map(n => (n.id === id ? updated : n)),
      unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount
    }));
  },

  markAllAsRead: async () => {
    const token = getToken();
    const res = await fetch('/api/notifications/read-all', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` }
    });
    await throwOnError(res, 'Failed to mark all as read');
    set(state => ({
      notifications: state.notifications.map(n => ({ ...n, read: true })),
      unreadCount: 0
    }));
  }
}));
