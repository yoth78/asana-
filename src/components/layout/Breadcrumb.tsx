import React, { useMemo } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import './layout.css';

const ROUTE_LABELS: Record<string, string> = {
  projects: 'Projects',
  tasks: 'My Tasks',
  inbox: 'Inbox',
  chat: 'Chat',
  admin: 'Admin',
  payroll: 'Payroll',
  settings: 'Settings',
  dashboard: 'Dashboard',
};

const looksLikeId = (value: string) =>
  /^[0-9a-f-]{20,}$/i.test(value) || value.startsWith('c') || value.includes('-');

export const Breadcrumb: React.FC = () => {
  const location = useLocation();
  const projects = useWorkspaceStore(state => state.projects);
  const tasks = useWorkspaceStore(state => state.tasks);

  const pathnames = location.pathname.split('/').filter(Boolean);

  const labels = useMemo(() => {
    return pathnames.map((value, index) => {
      const prev = pathnames[index - 1];

      if (ROUTE_LABELS[value]) {
        return ROUTE_LABELS[value];
      }

      if (prev === 'projects' && looksLikeId(value)) {
        return projects.find(p => p.id === value)?.name || 'Project';
      }

      if (prev === 'tasks' && looksLikeId(value)) {
        return tasks.find(t => t.id === value)?.title || 'Task';
      }

      if (looksLikeId(value)) {
        return 'Details';
      }

      return value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, ' ');
    });
  }, [pathnames, projects, tasks]);

  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem' }}>
      <Link to="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
        Home
      </Link>
      {pathnames.map((value, index) => {
        const to = `/${pathnames.slice(0, index + 1).join('/')}`;
        const isLast = index === pathnames.length - 1;
        const title = labels[index];

        return (
          <React.Fragment key={to}>
            <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
            {isLast ? (
              <span
                style={{
                  color: 'var(--text-primary)',
                  fontWeight: 500,
                  maxWidth: 220,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={title}
              >
                {title}
              </span>
            ) : (
              <Link to={to} style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
                {title}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};
