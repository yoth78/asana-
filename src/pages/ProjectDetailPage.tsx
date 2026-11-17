import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import KanbanBoard from '../components/tasks/KanbanBoard';
import ListView from '../components/tasks/ListView';
import CalendarView from '../components/tasks/CalendarView';
import TimelineView from '../components/tasks/TimelineView';
import TaskCreateModal from '../components/tasks/TaskCreateModal';
import { ProjectMembersModal } from '../components/projects/ProjectMembersModal';
import { ProjectDashboardView } from '../components/projects/ProjectDashboardView';
import { EmptyState } from '../components/common/EmptyState';
import {
  Settings,
  Plus,
  LayoutGrid,
  List,
  Calendar as CalendarIcon,
  Clock,
  Activity,
  Users,
  ArrowLeft,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import type { TaskStatus } from '../types';
import { isProjectVisibleToUser } from '../utils/projectAccess';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('') || '?';

const views = [
  { id: 'board', label: 'Board', icon: LayoutGrid },
  { id: 'list', label: 'List', icon: List },
  { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
  { id: 'timeline', label: 'Timeline', icon: Clock },
  { id: 'dashboard', label: 'Dashboard', icon: Activity },
] as const;

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const project = useWorkspaceStore(state => state.projects.find(p => p.id === id));
  const tasks = useWorkspaceStore(state => state.tasks);
  const fetchProjectMembers = useWorkspaceStore(state => state.fetchProjectMembers);
  const members = useWorkspaceStore(state => (id ? state.projectMembersByProject[id] : undefined));
  const { currentView, setCurrentView } = useUIStore();
  const { user, fetchUsers } = useAuthStore();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createModalStatus, setCreateModalStatus] = useState<TaskStatus>('TODO');
  const [isMembersOpen, setIsMembersOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchProjectMembers(id).catch(() => {});
    fetchUsers().catch(() => {});
  }, [id, fetchProjectMembers, fetchUsers]);

  const projectTasks = useMemo(
    () => (project ? tasks.filter(t => t.projectId === project.id && !t.parentTaskId) : []),
    [tasks, project]
  );

  const taskStats = useMemo(() => {
    const total = projectTasks.length;
    const done = projectTasks.filter(t => t.status === 'DONE').length;
    const inProgress = projectTasks.filter(t => t.status === 'IN_PROGRESS').length;
    const todo = projectTasks.filter(t => t.status === 'TODO').length;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, inProgress, todo, progress };
  }, [projectTasks]);

  const avatarMembers = useMemo(() => (members ?? []).slice(0, 5), [members]);

  const openCreateModal = (status: TaskStatus = 'TODO') => {
    setCreateModalStatus(status);
    setIsCreateModalOpen(true);
  };

  const canAccess = Boolean(project && user && isProjectVisibleToUser(project, user));

  if (!project || !canAccess) {
    return (
      <div style={{ padding: '2rem', maxWidth: 480, margin: '0 auto' }}>
        <EmptyState
          icon={LayoutGrid}
          title="Project not found"
          description="This project may have been deleted or you don't have access to it."
          action={
            <Link to="/projects" className="btn btn-primary">
              <ArrowLeft size={16} />
              Back to projects
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="project-detail-page">
      <header className="project-detail-header">
        <div className="project-detail-header-top">
          <div className="project-detail-info">
            <Link to="/projects" className="project-detail-back btn btn-ghost">
              <ArrowLeft size={14} />
              Projects
            </Link>

            <div className="project-detail-title-row">
              <span className="project-detail-dot" style={{ backgroundColor: project.color }} />
              <h1 className="project-detail-title">{project.name}</h1>
            </div>

            {project.description && <p className="project-detail-desc">{project.description}</p>}

            <div className="project-detail-stats">
              <span className="badge badge-default">
                <Circle size={12} /> {taskStats.todo} to do
              </span>
              <span className="badge badge-default">
                <Clock size={12} /> {taskStats.inProgress} in progress
              </span>
              <span className="badge badge-success">
                <CheckCircle2 size={12} /> {taskStats.done} done
              </span>
              {taskStats.total > 0 && (
                <div className="project-progress">
                  <div className="project-progress-track">
                    <div className="project-progress-fill" style={{ width: `${taskStats.progress}%` }} />
                  </div>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.8125rem' }}>
                    {taskStats.progress}%
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="project-detail-actions">
            <button
              type="button"
              onClick={() => setIsMembersOpen(true)}
              className="btn btn-ghost"
              title="Manage project members"
            >
              <div className="avatar-group">
                {avatarMembers.length === 0 ? (
                  <div className="avatar avatar-sm" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                    <Users size={12} />
                  </div>
                ) : (
                  avatarMembers.map(member => (
                    <div
                      key={member.userId}
                      className="avatar avatar-sm"
                      title={member.name}
                      style={{ background: project.color || 'var(--primary)' }}
                    >
                      {initials(member.name)}
                    </div>
                  ))
                )}
              </div>
              <span>{members?.length || project.memberCount || 0}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsMembersOpen(true)}
              className="btn btn-icon btn-ghost"
              title="Project settings & members"
            >
              <Settings size={20} />
            </button>

            <button type="button" onClick={() => openCreateModal()} className="btn btn-primary">
              <Plus size={16} />
              Add task
            </button>
          </div>
        </div>

        <div className="project-detail-tabs">
          {views.map(view => {
            const Icon = view.icon;
            const isActive = currentView === view.id;
            return (
              <button
                key={view.id}
                type="button"
                onClick={() => setCurrentView(view.id as typeof currentView)}
                className={`project-detail-tab ${isActive ? 'active' : ''}`}
              >
                <Icon size={16} />
                {view.label}
              </button>
            );
          })}
        </div>
      </header>

      <main className="project-detail-main">
        {taskStats.total === 0 && currentView !== 'dashboard' ? (
          <div className="card-panel project-detail-empty">
            <EmptyState
              icon={Plus}
              title="No tasks yet"
              description="Create your first task to start tracking work on this project. You can organize tasks on the board, list, or calendar."
              action={
                <button type="button" className="btn btn-primary" onClick={() => openCreateModal()}>
                  <Plus size={16} />
                  Create first task
                </button>
              }
            />
          </div>
        ) : (
          <>
            {currentView === 'board' && (
              <KanbanBoard projectId={project.id} onAddTask={status => openCreateModal(status)} />
            )}
            {currentView === 'list' && (
              <ListView projectId={project.id} onAddTask={status => openCreateModal(status)} />
            )}
            {currentView === 'calendar' && <CalendarView projectId={project.id} />}
            {currentView === 'timeline' && <TimelineView projectId={project.id} />}
            {currentView === 'dashboard' && <ProjectDashboardView projectId={project.id} />}
          </>
        )}
      </main>

      {isCreateModalOpen && (
        <TaskCreateModal
          projectId={project.id}
          initialStatus={createModalStatus}
          onClose={() => setIsCreateModalOpen(false)}
        />
      )}

      <ProjectMembersModal
        projectId={project.id}
        isOpen={isMembersOpen}
        onClose={() => setIsMembersOpen(false)}
      />
    </div>
  );
}
