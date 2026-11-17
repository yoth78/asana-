import React, { useState, useMemo } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useAuthStore } from '../store/authStore';
import { ProjectCard } from '../components/projects/ProjectCard';
import { ProjectCreateModal } from '../components/projects/ProjectCreateModal';
import { EmptyState } from '../components/common/EmptyState';
import { filterVisibleProjects } from '../utils/projectAccess';
import { Plus, Search, Filter, LayoutGrid } from 'lucide-react';
import type { User } from '../types';

export const ProjectsPage: React.FC = () => {
  const { projects, tasks, departments, addProject, projectMembersByProject } = useWorkspaceStore();
  const { user, allUsers } = useAuthStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortBy, setSortBy] = useState('Name');

  const visibleProjects = useMemo(() => filterVisibleProjects(projects, user), [projects, user]);

  const membersForProject = (projectId: string, memberIds?: string[]): User[] => {
    const cached = projectMembersByProject[projectId];
    if (cached?.length) {
      return cached
        .map(m => allUsers.find(u => u.id === m.userId))
        .filter(Boolean) as User[];
    }
    if (memberIds?.length) {
      return memberIds.map(id => allUsers.find(u => u.id === id)).filter(Boolean) as User[];
    }
    return [];
  };

  const filteredProjects = useMemo(() => {
    return visibleProjects
      .filter(
        p =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (p.description || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
      .filter(p => {
        if (statusFilter === 'All') return true;
        const pTasks = tasks.filter(t => t.projectId === p.id && !t.parentTaskId);
        const progress =
          pTasks.length > 0
            ? (pTasks.filter(t => t.status === 'DONE').length / pTasks.length) * 100
            : 0;
        if (statusFilter === 'Active') return progress < 100;
        if (statusFilter === 'Completed') return progress === 100;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'Name') return a.name.localeCompare(b.name);
        if (sortBy === 'Date') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        return 0;
      });
  }, [visibleProjects, tasks, searchQuery, statusFilter, sortBy]);

  const handleCreateProject = async (data: {
    name: string;
    description: string;
    color: string;
    departmentId: string;
  }) => {
    await addProject({
      name: data.name,
      description: data.description,
      color: data.color,
      departmentId: data.departmentId,
      workspaceId: user?.workspaceId || '',
      ownerId: user?.id || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as any);
  };

  const hasFilters = searchQuery.trim() !== '' || statusFilter !== 'All';
  const canCreate = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  return (
    <div className="page-content" style={{ padding: 'var(--spacing-6)' }}>
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
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: '0 0 0.25rem 0', color: 'var(--text-primary)' }}>
            Projects
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>
            {visibleProjects.length} project{visibleProjects.length === 1 ? '' : 's'} you can access
          </p>
        </div>

        {canCreate && (
          <button type="button" className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={18} />
            <span>Create Project</span>
          </button>
        )}
      </header>

      <div
        className="card-panel"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.5rem',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1rem'
        }}
      >
        <div style={{ display: 'flex', gap: '1rem', flex: 1, minWidth: '260px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)'
              }}
            />
            <input
              type="text"
              placeholder="Search projects…"
              className="input"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', paddingLeft: '2.5rem' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Filter size={16} style={{ color: 'var(--text-muted)' }} />
            <select
              className="select"
              style={{ width: '140px' }}
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="All">All status</option>
              <option value="Active">Active</option>
              <option value="Completed">Completed</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Sort</span>
          <select className="select" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ width: '150px' }}>
            <option value="Name">Name (A–Z)</option>
            <option value="Date">Recent first</option>
          </select>
        </div>
      </div>

      {filteredProjects.length > 0 ? (
        <div className="projects-grid">
          {filteredProjects.map((project, index) => {
            const projectTasks = tasks.filter(t => t.projectId === project.id && !t.parentTaskId);
            const members = membersForProject(project.id, project.memberIds);
            return (
              <ProjectCard
                key={project.id}
                project={project}
                tasks={projectTasks}
                members={members}
                memberCount={project.memberCount ?? members.length}
                index={index}
              />
            );
          })}
        </div>
      ) : (
        <div className="card-panel" style={{ borderStyle: 'dashed' }}>
          <EmptyState
            icon={LayoutGrid}
            title={hasFilters ? 'No matching projects' : 'No projects yet'}
            description={
              hasFilters
                ? 'Try clearing search or filters to see more projects.'
                : canCreate
                  ? 'Create a project to start tracking tasks with your team.'
                  : 'Projects you are added to will appear here.'
            }
            action={
              hasFilters ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('All');
                  }}
                >
                  Clear filters
                </button>
              ) : canCreate ? (
                <button type="button" className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
                  Create project
                </button>
              ) : undefined
            }
          />
        </div>
      )}

      <ProjectCreateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateProject}
        departments={departments}
      />
    </div>
  );
};
