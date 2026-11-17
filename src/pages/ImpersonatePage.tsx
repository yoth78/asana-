import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useChatStore } from '../store/chatStore';
import { useNotificationStore } from '../store/notificationStore';
import { clearClientDataCaches } from '../hooks/useWorkspaceBootstrap';

/** Staff support login: /#/impersonate?token=... */
export const ImpersonatePage: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setUser = useAuthStore(s => s.setUser);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setError('Missing impersonation token');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        localStorage.setItem('token', token);
        useWorkspaceStore.getState().reset();
        useChatStore.getState().reset();
        useNotificationStore.getState().reset();
        clearClientDataCaches();

        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const user = await res.json().catch(() => null);
        if (!res.ok || !user?.id) {
          throw new Error(user?.error || 'Invalid or expired impersonation session');
        }
        if (cancelled) return;
        setUser(user);
        sessionStorage.setItem('platform_impersonation', '1');
        navigate('/dashboard', { replace: true });
      } catch (e: any) {
        localStorage.removeItem('token');
        if (!cancelled) setError(e.message || 'Impersonation failed');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params, navigate, setUser]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--bg-primary, #0d1117)',
        color: 'var(--text-primary, #e6edf3)',
        padding: '2rem'
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Support session</h1>
        {error ? (
          <p style={{ color: '#f85149' }}>{error}</p>
        ) : (
          <p style={{ color: 'var(--text-muted, #8b949e)' }}>Starting timed support access…</p>
        )}
      </div>
    </div>
  );
};
