import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Bell, Sun, Moon, Building2, ChevronDown, Plus
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Breadcrumb } from './Breadcrumb';
import { Avatar } from '../common/Avatar';
import { SearchModal } from './SearchModal';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { useNotificationStore } from '../../store/notificationStore';
import toast from 'react-hot-toast';
import type { Role } from '../../types';
import './layout.css';

type WorkspaceOption = {
  id: string;
  name: string;
  role: Role;
  isActive: boolean;
  plan?: string;
};

export const Header: React.FC = () => {
  const navigate = useNavigate();

  const { theme, toggleTheme } = useUIStore();
  const { user, logout, fetchMyWorkspaces, switchWorkspace, createWorkspace } = useAuthStore();
  const {
    notifications,
    unreadCount,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead
  } = useNotificationStore();

  const [searchFocused, setSearchFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [switching, setSwitching] = useState(false);

  const displayName = user?.name || 'User';
  const canOpenAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  const activeWorkspaceLabel = user?.workspaceName || 'Workspace';

  const loadWorkspaces = async () => {
    try {
      const list = await fetchMyWorkspaces();
      setWorkspaces(list);
    } catch {
      /* ignore — menu still usable with current name */
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (showNotifications) fetchNotifications();
  }, [showNotifications, fetchNotifications]);

  useEffect(() => {
    if (showWorkspaceMenu) loadWorkspaces();
  }, [showWorkspaceMenu, user?.workspaceId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const goTo = (path: string) => {
    setShowProfileMenu(false);
    navigate(path);
  };

  const handleLogout = () => {
    setShowProfileMenu(false);
    logout();
    navigate('/login', { replace: true });
  };

  const openSearch = () => {
    setSearchOpen(true);
    setSearchFocused(true);
  };

  const recentUnread = notifications.filter(n => !n.read).slice(0, 5);

  const handleNotificationClick = async (id: string, targetType: string, targetId: string) => {
    await markAsRead(id);
    setShowNotifications(false);
    if (targetType === 'task' && targetId) {
      const { useWorkspaceStore } = await import('../../store/workspaceStore');
      const task = useWorkspaceStore.getState().tasks.find(t => t.id === targetId);
      if (task?.projectId) navigate(`/projects/${task.projectId}`);
    } else if (targetType === 'project') {
      navigate(`/projects/${targetId}`);
    } else {
      navigate('/inbox');
    }
  };

  const handleSwitchWorkspace = async (workspaceId: string) => {
    if (workspaceId === user?.workspaceId || switching) return;
    setSwitching(true);
    try {
      await switchWorkspace(workspaceId);
      setShowWorkspaceMenu(false);
      toast.success('Switched workspace');
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      toast.error(err.message || 'Could not switch workspace');
    } finally {
      setSwitching(false);
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newWorkspaceName.trim();
    if (!name) return;
    setSwitching(true);
    try {
      await createWorkspace(name);
      setNewWorkspaceName('');
      setCreatingWorkspace(false);
      setShowWorkspaceMenu(false);
      toast.success(`Created ${name}`);
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      toast.error(err.message || 'Could not create workspace');
    } finally {
      setSwitching(false);
    }
  };

  return (
    <>
      <header className="header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 var(--spacing-6)' }}>
        <div className="header-left" style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, gap: 12 }}>
          <div className="workspace-switcher" style={{ position: 'relative', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => {
                setShowWorkspaceMenu(!showWorkspaceMenu);
                setShowProfileMenu(false);
                setShowNotifications(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                maxWidth: 220,
                padding: '6px 10px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                color: 'var(--text-primary)'
              }}
              title="Switch workspace"
            >
              <Building2 size={16} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.875rem', fontWeight: 600 }}>
                {activeWorkspaceLabel}
              </span>
              <ChevronDown size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
            </button>

            {showWorkspaceMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  width: 280,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-md)',
                  zIndex: 60,
                  marginTop: 8,
                  overflow: 'hidden'
                }}
              >
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-color)', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Your workspaces
                </div>
                <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                  {(workspaces.length ? workspaces : [{ id: user?.workspaceId || '', name: activeWorkspaceLabel, role: (user?.role || 'MEMBER') as Role, isActive: true }]).map(ws => (
                    <button
                      key={ws.id || ws.name}
                      type="button"
                      disabled={!ws.id || switching || ws.isActive}
                      onClick={() => ws.id && handleSwitchWorkspace(ws.id)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        textAlign: 'left',
                        background: ws.isActive ? 'var(--bg-hover, rgba(0,0,0,0.04))' : 'transparent',
                        border: 'none',
                        borderBottom: '1px solid var(--border-color)',
                        cursor: ws.isActive ? 'default' : 'pointer',
                        opacity: switching ? 0.6 : 1
                      }}
                    >
                      <strong style={{ display: 'block', fontSize: '0.875rem' }}>{ws.name}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {ws.role.replace('_', ' ')}
                        {ws.isActive ? ' · current' : ''}
                      </span>
                    </button>
                  ))}
                </div>
                <div style={{ padding: 10 }}>
                  {creatingWorkspace ? (
                    <form onSubmit={handleCreateWorkspace} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input
                        autoFocus
                        value={newWorkspaceName}
                        onChange={e => setNewWorkspaceName(e.target.value)}
                        placeholder="New company name"
                        style={{
                          padding: '8px 10px',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)'
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="submit" className="btn btn-primary" disabled={switching || !newWorkspaceName.trim()} style={{ flex: 1 }}>
                          Create
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => setCreatingWorkspace(false)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCreatingWorkspace(true)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        padding: '8px',
                        background: 'transparent',
                        border: '1px dashed var(--border-color)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                        fontSize: '0.875rem'
                      }}
                    >
                      <Plus size={14} /> Create workspace
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          <Breadcrumb />
        </div>

        <div className="header-center" style={{ display: 'flex', justifyContent: 'center', flex: 1 }}>
          <div
            className={`search-container ${searchFocused ? 'focused' : ''}`}
            style={{ cursor: 'pointer' }}
            onClick={openSearch}
          >
            <Search size={16} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              readOnly
              placeholder="Search tasks, projects (Ctrl+K)"
              onFocus={() => {
                setSearchFocused(true);
                openSearch();
              }}
              onBlur={() => setSearchFocused(false)}
              className="search-input"
              style={{ cursor: 'pointer' }}
            />
          </div>
        </div>

        <div className="header-right" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '16px', flex: 1 }}>
          <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={toggleTheme}
              style={{ padding: '6px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            <div className="notification-wrapper" style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowNotifications(!showNotifications)}
                style={{ padding: '6px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', position: 'relative' }}
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: '2px', right: '4px',
                    background: 'var(--error)', color: 'white', fontSize: '10px', fontWeight: 'bold',
                    borderRadius: '50%', minWidth: '14px', height: '14px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px'
                  }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                  <div
                    style={{
                      position: 'absolute', top: '100%', right: 0, width: '320px',
                      background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', zIndex: 50,
                      marginTop: '8px', overflow: 'hidden'
                    }}
                  >
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Notifications</span>
                      <button
                        type="button"
                        onClick={() => { setShowNotifications(false); navigate('/inbox'); }}
                        style={{ fontSize: '0.75rem', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        View all
                      </button>
                    </div>
                    {recentUnread.length === 0 ? (
                      <div style={{ padding: '16px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        No unread notifications
                      </div>
                    ) : (
                      recentUnread.map(n => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => handleNotificationClick(n.id, n.targetType, n.targetId)}
                          style={{
                            width: '100%', padding: '12px 16px', textAlign: 'left',
                            background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)',
                            cursor: 'pointer', color: 'var(--text-primary)'
                          }}
                        >
                          <p style={{ margin: '0 0 4px', fontSize: '0.875rem', fontWeight: 600 }}>{n.title}</p>
                          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                )}
            </div>

            <div className="profile-wrapper" style={{ position: 'relative', marginLeft: '8px' }}>
              <button
                type="button"
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                style={{ padding: 0, background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-md)' }}
              >
                <Avatar name={displayName} src={user?.profilePic} size="sm" status="online" />
              </button>

              {showProfileMenu && (
                  <div
                    style={{
                      position: 'absolute', top: '100%', right: 0, width: '200px',
                      background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', zIndex: 50, marginTop: '8px'
                    }}
                  >
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
                      <strong style={{ display: 'block', fontSize: '0.875rem' }}>{displayName}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user?.role}</span>
                    </div>
                    <div style={{ padding: '8px 0' }}>
                      <button type="button" onClick={() => goTo('/settings')} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-primary)' }}>Profile Settings</button>
                      {canOpenAdmin && (
                        <button type="button" onClick={() => goTo('/admin')} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-primary)' }}>Admin Panel</button>
                      )}
                      <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />
                      <button type="button" onClick={handleLogout} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--error)' }}>Logout</button>
                    </div>
                  </div>
                )}
            </div>
          </div>
        </div>
      </header>

      <SearchModal
        isOpen={searchOpen}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        onClose={() => {
          setSearchOpen(false);
          setSearchQuery('');
          setSearchFocused(false);
        }}
      />
    </>
  );
};
