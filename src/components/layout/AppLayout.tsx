import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { useNotificationStore } from '../../store/notificationStore';
import { useWorkspaceBootstrap } from '../../hooks/useWorkspaceBootstrap';
import './layout.css';

export const AppLayout: React.FC = () => {
  const { sidebarCollapsed } = useUIStore();
  const { user, isAuthenticated, fetchUsers, logout } = useAuthStore();
  const { fetchUnreadCount } = useNotificationStore();
  const location = useLocation();
  const isChatRoute = location.pathname.startsWith('/chat');

  const [resolvedWorkspaceId, setResolvedWorkspaceId] = useState<string | undefined>(
    user?.workspaceId
  );

  useEffect(() => {
    setResolvedWorkspaceId(user?.workspaceId);
  }, [user?.workspaceId]);

  useWorkspaceBootstrap(
    isAuthenticated ? resolvedWorkspaceId : undefined,
    isAuthenticated ? user?.id : undefined
  );

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    void fetchUsers();
    void fetchUnreadCount();

    if (user.workspaceId || resolvedWorkspaceId) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/workspaces', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok || cancelled) return;
        const workspaces = await res.json();
        const id = workspaces[0]?.id as string | undefined;
        if (id && !cancelled) setResolvedWorkspaceId(id);
      } catch (error) {
        console.error('Failed to resolve workspace', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id, user?.workspaceId, resolvedWorkspaceId, fetchUsers, fetchUnreadCount]);

  const suspended = user?.workspaceStatus === 'SUSPENDED';
  const showUpgradeHint =
    user?.entitlements &&
    user.entitlements.features?.chat === false &&
    user.entitlements.plan === 'FREE';
  const impersonating = sessionStorage.getItem('platform_impersonation') === '1';

  return (
    <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar />
      <div className={`main-content ${isChatRoute ? 'main-content--chat' : ''}`}>
        <Header />
        {impersonating && (
          <div
            role="status"
            style={{
              margin: '0.75rem 1rem 0',
              padding: '0.65rem 1rem',
              borderRadius: 8,
              border: '1px solid #9e6a03',
              background: 'rgba(210, 153, 34, 0.12)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
              display: 'flex',
              justifyContent: 'space-between',
              gap: '1rem',
              alignItems: 'center'
            }}
          >
            <span>Support impersonation session is active. Ends when this token expires (~30 min).</span>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ margin: 0, padding: '0.35rem 0.6rem' }}
              onClick={() => {
                sessionStorage.removeItem('platform_impersonation');
                logout();
                window.location.hash = '#/login';
              }}
            >
              End session
            </button>
          </div>
        )}
        {suspended && (
          <div
            role="alert"
            style={{
              margin: '0.75rem 1rem 0',
              padding: '0.75rem 1rem',
              borderRadius: 8,
              border: '1px solid #6e2b2b',
              background: 'rgba(248, 81, 73, 0.08)',
              color: 'var(--text-primary)',
              fontSize: '0.9rem'
            }}
          >
            This workspace is suspended. Most actions are blocked. Contact support if you believe this is a
            mistake.
          </div>
        )}
        {showUpgradeHint && !suspended && (
          <div
            role="status"
            style={{
              margin: '0.75rem 1rem 0',
              padding: '0.65rem 1rem',
              borderRadius: 8,
              border: '1px solid var(--border-dark, #30363d)',
              background: 'rgba(56, 139, 253, 0.08)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem'
            }}
          >
            Chat is not included on the Free plan. Upgrade to Starter or ask your admin about a promo.
          </div>
        )}
        <main className={`page-container ${isChatRoute ? 'page-container--chat' : ''}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};
