import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Plus,
  FolderKanban,
  ListChecks
} from 'lucide-react';
import { format, formatDistanceToNow, isFuture, isPast, isToday } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer
} from 'recharts';

import { useAuthStore } from '../store/authStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import { ProductivityChart } from '../components/dashboard/ProductivityChart';
import { EmptyState } from '../components/common/EmptyState';

interface StatCardProps {
  title: string;
  value: string | number;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, color }) => (
  <div
    className="card-panel col-span-3"
    style={{ borderTop: `4px solid ${color}`, padding: '1.25rem' }}
  >
    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{title}</p>
    <h3 style={{ margin: '0.35rem 0 0 0', fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
      {value}
    </h3>
  </div>
);

const WelcomeBar: React.FC<{
  title: string;
  subtitle: string;
  accent?: string;
  actions?: React.ReactNode;
}> = ({ title, subtitle, accent, actions }) => (
  <div className="bento-grid" style={{ marginBottom: '1.5rem' }}>
    <div
      className="card-panel col-span-12"
      style={{
        padding: '1.5rem 1.75rem',
        borderLeft: accent ? `4px solid ${accent}` : '4px solid var(--primary)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
        flexWrap: 'wrap'
      }}
    >
      <div>
        <h1 style={{ margin: '0 0 0.35rem 0', fontSize: '1.5rem', color: 'var(--text-primary)' }}>{title}</h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{subtitle}</p>
      </div>
      {actions && <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  </div>
);

const SuperAdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, allUsers } = useAuthStore();
  const { departments, projects, tasks, activityLog } = useWorkspaceStore();

  const rootTasks = tasks.filter(t => !t.parentTaskId);
  const doneTasks = rootTasks.filter(t => t.status === 'DONE').length;
  const openTasks = rootTasks.length - doneTasks;

  const needsOnboarding = departments.length === 0;

  const taskDistribution = [
    { name: 'To Do', value: rootTasks.filter(t => t.status === 'TODO').length },
    { name: 'In Progress', value: rootTasks.filter(t => t.status === 'IN_PROGRESS').length },
    { name: 'Review', value: rootTasks.filter(t => t.status === 'REVIEW').length },
    { name: 'Done', value: rootTasks.filter(t => t.status === 'DONE').length }
  ];

  return (
    <div>
      <WelcomeBar
        title={`Welcome back, ${user?.name?.split(' ')[0] || 'there'}`}
        subtitle={format(new Date(), 'EEEE, MMMM do, yyyy')}
        actions={
          <>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/admin/departments')}>
              <Plus size={16} /> Department
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/admin/invite')}>
              <Users size={16} /> Invite
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/projects')}>
              <FolderKanban size={16} /> Projects
            </button>
          </>
        }
      />

      {needsOnboarding && (
        <div className="card-panel" style={{ marginBottom: '1.5rem' }}>
          <EmptyState
            title="Set up your workspace"
            description="Create a department, invite your team, then add a project. That unlocks tasks, chat channels, and day-to-day work."
            action={
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button type="button" className="btn btn-primary" onClick={() => navigate('/admin/departments')}>
                  1. Create department
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => navigate('/admin/invite')}>
                  2. Invite people
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => navigate('/projects')}>
                  3. Create project
                </button>
              </div>
            }
          />
        </div>
      )}

      <div className="bento-grid" style={{ marginBottom: '1.5rem' }}>
        <StatCard title="Departments" value={departments.length} color="var(--primary)" />
        <StatCard title="People" value={allUsers.length} color="#00B894" />
        <StatCard title="Projects" value={projects.length} color="#0984E3" />
        <StatCard title="Open tasks" value={openTasks} color="#E17055" />
      </div>

      <div className="bento-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="card-panel col-span-8">
          <ProductivityChart tasks={rootTasks} />
        </div>

        <div className="card-panel col-span-4">
          <h3 className="card-panel-title">Task status</h3>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={taskDistribution} layout="vertical" margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-color)" />
                <XAxis type="number" stroke="var(--text-secondary)" allowDecimals={false} />
                <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" width={90} fontSize={12} />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-color)',
                    borderRadius: '0.5rem'
                  }}
                />
                <Bar dataKey="value" fill="var(--primary)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bento-grid">
        <div className="card-panel col-span-8">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 className="card-panel-title" style={{ margin: 0 }}>Departments</h3>
            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => navigate('/admin/departments')}>
              Manage
            </button>
          </div>
          {departments.length === 0 ? (
            <EmptyState
              compact
              title="No departments yet"
              description="Departments organize people, projects, and chat."
              action={
                <button type="button" className="btn btn-primary" onClick={() => navigate('/admin/departments')}>
                  Create department
                </button>
              }
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
              {departments.map(dept => {
                const deptProjects = projects.filter(
                  p => (p as any).departmentId === dept.id || (p as any).teamId === dept.id
                );
                const deptProjectIds = deptProjects.map(p => p.id);
                const deptTasks = rootTasks.filter(t => deptProjectIds.includes(t.projectId));
                const progress = deptTasks.length
                  ? Math.round((deptTasks.filter(t => t.status === 'DONE').length / deptTasks.length) * 100)
                  : 0;
                const admin = allUsers.find(u => u.id === dept.adminId);
                const memberCount =
                  allUsers.filter(u => u.departmentId === dept.id).length ||
                  dept.memberIds?.length ||
                  dept.memberCount ||
                  0;

                return (
                  <div
                    key={dept.id}
                    style={{
                      padding: '1.1rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-color)',
                      borderLeft: `4px solid ${dept.color}`
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <h4 style={{ margin: 0, fontSize: '1rem' }}>{dept.name}</h4>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {memberCount} people
                      </span>
                    </div>
                    {admin && (
                      <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Lead: {admin.name}
                      </p>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      <span>{deptProjects.length} projects · {deptTasks.length} tasks</span>
                      <span>{progress}%</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--border-color)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${progress}%`, background: dept.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card-panel col-span-4">
          <h3 className="card-panel-title">Recent activity</h3>
          {activityLog.length === 0 ? (
            <EmptyState
              compact
              title="No activity yet"
              description="Creates, updates, and comments will show up here."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', maxHeight: 420, overflowY: 'auto' }}>
              {activityLog.slice(0, 12).map(entry => (
                <div
                  key={entry.id}
                  style={{
                    paddingBottom: '0.85rem',
                    borderBottom: '1px solid var(--border-color)'
                  }}
                >
                  <div>
                    <p style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                      <span style={{ fontWeight: 600 }}>{entry.userName || 'Someone'}</span>{' '}
                      {entry.action.replace(/_/g, ' ')}
                      {entry.details ? `: ${entry.details}` : ''}
                    </p>
                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, allUsers } = useAuthStore();
  const { departments, tasks, projects } = useWorkspaceStore();

  const department = departments.find(d => d.id === user?.departmentId);
  const deptMembers = allUsers.filter(u => u.departmentId === user?.departmentId);
  const deptProjects = projects.filter(
    p => (p as any).departmentId === user?.departmentId || (p as any).teamId === user?.departmentId
  );
  const deptProjectIds = deptProjects.map(p => p.id);
  const deptTasks = tasks.filter(
    t => !t.parentTaskId && deptProjectIds.includes(t.projectId)
  );
  const completedTasks = deptTasks.filter(t => t.status === 'DONE').length;

  const taskDistribution = [
    { name: 'To Do', value: deptTasks.filter(t => t.status === 'TODO').length },
    { name: 'In Progress', value: deptTasks.filter(t => t.status === 'IN_PROGRESS').length },
    { name: 'Review', value: deptTasks.filter(t => t.status === 'REVIEW').length },
    { name: 'Done', value: deptTasks.filter(t => t.status === 'DONE').length }
  ];

  if (!user?.departmentId) {
    return (
      <div className="card-panel">
        <EmptyState
          title="No department assigned"
          description="Your account is active, but you are not linked to a department yet. Ask a Super Admin to assign you."
        />
      </div>
    );
  }

  if (!department) {
    return (
      <div className="card-panel">
        <EmptyState
          compact
          title="Loading department…"
          description="Fetching your department data. Refresh if this stays empty."
        />
      </div>
    );
  }

  return (
    <div>
      <WelcomeBar
        title={department.name}
        subtitle={department.description || 'Department overview'}
        accent={department.color}
        actions={
          <>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/projects')}>
              <Plus size={16} /> Project
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/admin/invite')}>
              <Users size={16} /> Invite
            </button>
          </>
        }
      />

      <div className="bento-grid" style={{ marginBottom: '1.5rem' }}>
        <StatCard title="Members" value={deptMembers.length} color={department.color} />
        <StatCard title="Tasks" value={deptTasks.length} color={department.color} />
        <StatCard title="Projects" value={deptProjects.length} color={department.color} />
        <StatCard title="Completed" value={completedTasks} color={department.color} />
      </div>

      <div className="bento-grid">
        <div className="card-panel col-span-8">
          <h3 className="card-panel-title">Task status</h3>
          {deptTasks.length === 0 ? (
            <EmptyState
              compact
              title="No department tasks yet"
              description="Create a project and add tasks to see progress here."
              action={
                <button type="button" className="btn btn-primary" onClick={() => navigate('/projects')}>
                  Go to projects
                </button>
              }
            />
          ) : (
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={taskDistribution} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-color)" />
                  <XAxis type="number" stroke="var(--text-secondary)" allowDecimals={false} />
                  <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" width={100} />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-color)',
                      borderRadius: '0.5rem'
                    }}
                  />
                  <Bar dataKey="value" fill={department.color} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card-panel col-span-4">
          <h3 className="card-panel-title">Members</h3>
          {deptMembers.length === 0 ? (
            <EmptyState
              compact
              title="No members yet"
              description="Invite people or add existing company users to this department."
              action={
                <button type="button" className="btn btn-secondary" onClick={() => navigate('/admin/invite')}>
                  Invite
                </button>
              }
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 360, overflowY: 'auto' }}>
              {deptMembers.map(member => {
                const memberTasks = deptTasks.filter(t => t.assigneeId === member.id).length;
                return (
                  <div
                    key={member.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.85rem',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 'var(--radius-md)',
                          background: `${department.color}20`,
                          color: department.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          flexShrink: 0
                        }}
                      >
                        {member.name.charAt(0)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <h4 style={{ margin: 0, fontSize: '0.875rem' }}>{member.name}</h4>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {member.role.replace('_', ' ')}
                        </p>
                      </div>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {memberTasks} tasks
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const MemberDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { tasks, projects } = useWorkspaceStore();

  const myTasks = tasks.filter(t => !t.parentTaskId && t.assigneeId === user?.id);
  const dueToday = myTasks.filter(
    t => t.dueDate && isToday(new Date(t.dueDate)) && t.status !== 'DONE'
  ).length;
  const overdue = myTasks.filter(
    t =>
      t.dueDate &&
      isPast(new Date(t.dueDate)) &&
      !isToday(new Date(t.dueDate)) &&
      t.status !== 'DONE'
  ).length;
  const completed = myTasks.filter(t => t.status === 'DONE').length;

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return '#D63031';
      case 'HIGH':
        return '#E17055';
      case 'MEDIUM':
        return '#FDCB6E';
      case 'LOW':
        return '#00B894';
      default:
        return 'var(--text-secondary)';
    }
  };

  const upcomingDeadlines = myTasks
    .filter(t => t.dueDate && isFuture(new Date(t.dueDate)) && t.status !== 'DONE')
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 5);

  const statuses = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const;
  const pending = myTasks.length - completed;

  return (
    <div>
      <WelcomeBar
        title="My workspace"
        subtitle={`Hi ${user?.name?.split(' ')[0] || ''}. You have ${pending} open task${pending === 1 ? '' : 's'}.`}
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/my-tasks')}>
            <ListChecks size={16} /> My tasks
          </button>
        }
      />

      <div className="bento-grid" style={{ marginBottom: '1.5rem' }}>
        <StatCard title="My tasks" value={myTasks.length} color="var(--primary)" />
        <StatCard title="Due today" value={dueToday} color="#FDCB6E" />
        <StatCard title="Overdue" value={overdue} color="#D63031" />
        <StatCard title="Completed" value={completed} color="#00B894" />
      </div>

      <div className="bento-grid">
        <div className="card-panel col-span-8">
          <h3 className="card-panel-title">My tasks</h3>
          {myTasks.length === 0 ? (
            <EmptyState
              compact
              title="Nothing assigned yet"
              description="When someone assigns you a task, it will show up here and on My Tasks."
              action={
                <button type="button" className="btn btn-secondary" onClick={() => navigate('/projects')}>
                  Browse projects
                </button>
              }
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {statuses.map(status => {
                const statusTasks = myTasks.filter(t => t.status === status);
                if (statusTasks.length === 0) return null;
                return (
                  <div key={status}>
                    <h4
                      style={{
                        margin: '0 0 0.75rem 0',
                        color: 'var(--text-secondary)',
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}
                    >
                      {status.replace('_', ' ')} ({statusTasks.length})
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {statusTasks.slice(0, 6).map(task => {
                        const project = projects.find(p => p.id === task.projectId);
                        return (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => navigate(`/projects/${task.projectId}`)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '0.85rem 1rem',
                              border: '1px solid var(--border-color)',
                              borderRadius: 'var(--radius-md)',
                              background: 'transparent',
                              cursor: 'pointer',
                              textAlign: 'left',
                              color: 'inherit'
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{task.title}</div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                {project?.name || 'Project'}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  padding: '0.2rem 0.45rem',
                                  borderRadius: '1rem',
                                  background: `${getPriorityColor(task.priority)}20`,
                                  color: getPriorityColor(task.priority)
                                }}
                              >
                                {task.priority}
                              </span>
                              {task.dueDate && (
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                  {format(new Date(task.dueDate), 'MMM dd')}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card-panel col-span-4">
          <h3 className="card-panel-title">Upcoming</h3>
          {upcomingDeadlines.length === 0 ? (
            <EmptyState
              compact
              title="No upcoming deadlines"
              description="Tasks with due dates will appear here."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {upcomingDeadlines.map(task => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => navigate(`/projects/${task.projectId}`)}
                  style={{
                    padding: '0.85rem',
                    borderLeft: `3px solid ${getPriorityColor(task.priority)}`,
                    borderTop: '1px solid var(--border-color)',
                    borderRight: '1px solid var(--border-color)',
                    borderBottom: '1px solid var(--border-color)',
                    borderRadius: '0 var(--radius-md) var(--radius-md) 0',
                    background: 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'inherit'
                  }}
                >
                  <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{task.title}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    Due {task.dueDate ? format(new Date(task.dueDate), 'MMM dd, yyyy') : '-'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  if (!user) return null;
  if (user.role === 'SUPER_ADMIN') return <SuperAdminDashboard />;
  if (user.role === 'ADMIN') return <AdminDashboard />;
  return <MemberDashboard />;
};
