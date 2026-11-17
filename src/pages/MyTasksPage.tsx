import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useAuthStore } from '../store/authStore';
import { filterVisibleProjects } from '../utils/projectAccess';
import type { Task } from '../types';
import {
  CheckCircle2,
  Circle,
  Clock,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  ListChecks
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { EmptyState } from '../components/common/EmptyState';

export const MyTasksPage: React.FC = () => {
  const navigate = useNavigate();
  const { tasks, projects, updateTask } = useWorkspaceStore();
  const { user } = useAuthStore();

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    overdue: true,
    today: true,
    upcoming: true,
    noDueDate: true,
    completed: false
  });

  const myTasks = useMemo(() => {
    if (!user) return [];

    const visibleProjectIds = filterVisibleProjects(projects, user).map(p => p.id);

    return tasks.filter(
      t =>
        !t.parentTaskId &&
        (t.assigneeId === user.id ||
          (user.role !== 'MEMBER' &&
            !t.assigneeId &&
            visibleProjectIds.includes(t.projectId)) ||
          (user.role !== 'MEMBER' && visibleProjectIds.includes(t.projectId)))
    );
  }, [tasks, projects, user]);

  const hasValidDueDate = (task: Task) => {
    if (!task.dueDate) return false;
    const d = new Date(task.dueDate);
    return !Number.isNaN(d.getTime());
  };

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const getProjectName = (projectId: string) => {
    return projects.find(p => p.id === projectId)?.name || 'Unknown Project';
  };

  const handleToggleComplete = async (task: Task) => {
    const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
    try {
      await updateTask(task.id, { status: newStatus });
    } catch (err: any) {
      toast.error(err.message || 'Failed to update task');
    }
  };

  const PriorityIcon = ({ priority }: { priority: string }) => {
    switch (priority) {
      case 'URGENT':
        return <AlertCircle size={14} style={{ color: 'var(--error)' }} />;
      case 'HIGH':
        return <ArrowUp size={14} style={{ color: 'var(--warning)' }} />;
      case 'MEDIUM':
        return <ArrowRight size={14} style={{ color: 'var(--primary)' }} />;
      case 'LOW':
        return <ArrowDown size={14} style={{ color: 'var(--text-muted)' }} />;
      default:
        return null;
    }
  };

  const now = new Date();
  const groupedTasks = {
    overdue: myTasks.filter(t => {
      if (t.status === 'DONE' || !hasValidDueDate(t)) return false;
      const dueDate = new Date(t.dueDate!);
      return dueDate < now && dueDate.toDateString() !== now.toDateString();
    }),
    today: myTasks.filter(t => {
      if (t.status === 'DONE' || !hasValidDueDate(t)) return false;
      return new Date(t.dueDate!).toDateString() === now.toDateString();
    }),
    upcoming: myTasks.filter(t => {
      if (t.status === 'DONE' || !hasValidDueDate(t)) return false;
      const dueDate = new Date(t.dueDate!);
      return dueDate > now && dueDate.toDateString() !== now.toDateString();
    }),
    noDueDate: myTasks.filter(t => t.status !== 'DONE' && !hasValidDueDate(t)),
    completed: myTasks.filter(t => t.status === 'DONE')
  };

  const openCount =
    groupedTasks.overdue.length +
    groupedTasks.today.length +
    groupedTasks.upcoming.length +
    groupedTasks.noDueDate.length;

  const TaskRow = ({ task }: { task: Task }) => (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0.75rem 1rem',
        borderBottom: '1px solid var(--border-color)',
        cursor: 'pointer',
        transition: 'background-color var(--transition-fast)'
      }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
      onClick={() => navigate(`/projects/${task.projectId}`)}
    >
      <button
        type="button"
        className="btn-icon"
        style={{ marginRight: '0.75rem', flexShrink: 0, padding: 0 }}
        onClick={e => {
          e.stopPropagation();
          handleToggleComplete(task);
        }}
      >
        {task.status === 'DONE' ? (
          <CheckCircle2 size={20} style={{ color: 'var(--success)' }} />
        ) : (
          <Circle size={20} style={{ color: 'var(--text-muted)' }} />
        )}
      </button>

      <div style={{ flex: 1, minWidth: 0, paddingRight: '1rem' }}>
        <h4
          style={{
            fontSize: '0.875rem',
            fontWeight: 500,
            margin: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: task.status === 'DONE' ? 'var(--text-muted)' : 'var(--text-primary)',
            textDecoration: task.status === 'DONE' ? 'line-through' : 'none'
          }}
        >
          {task.title}
        </h4>
        <div
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            marginTop: '0.25rem',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {getProjectName(task.projectId)}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            width: '90px'
          }}
        >
          <PriorityIcon priority={task.priority} />
          <span style={{ textTransform: 'capitalize' }}>{task.priority.toLowerCase()}</span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            width: '100px'
          }}
        >
          <Clock size={12} />
          {task.dueDate
            ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : 'No date'}
        </div>
      </div>
    </motion.div>
  );

  const TaskGroup = ({
    title,
    tasks: groupTasks,
    groupKey
  }: {
    title: string;
    tasks: Task[];
    groupKey: string;
  }) => {
    const isExpanded = expandedGroups[groupKey];
    if (groupTasks.length === 0 && groupKey !== 'today' && groupKey !== 'overdue') return null;

    return (
      <div style={{ marginBottom: '1.25rem' }}>
        <button
          type="button"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            width: '100%',
            textAlign: 'left',
            padding: '0.5rem',
            background: 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            marginBottom: '0.5rem',
            transition: 'background-color var(--transition-fast)'
          }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          onClick={() => toggleGroup(groupKey)}
        >
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>{title}</h3>
          <span className="badge badge-default" style={{ marginLeft: '0.35rem' }}>
            {groupTasks.length}
          </span>
        </button>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: 'hidden' }}
            >
              {groupTasks.length > 0 ? (
                <div className="card-panel" style={{ padding: 0, overflow: 'hidden', marginLeft: '1.25rem' }}>
                  {groupTasks.map((task: Task) => (
                    <TaskRow key={task.id} task={task} />
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    padding: '0.85rem',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    border: '1px dashed var(--border-color)',
                    borderRadius: 'var(--radius-lg)',
                    marginLeft: '1.25rem',
                    fontSize: '0.85rem'
                  }}
                >
                  Nothing here
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="page-content" style={{ maxWidth: '1000px', margin: '0 auto', padding: 'var(--spacing-6)' }}>
      <header className="page-header" style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: '0 0 0.25rem 0', color: 'var(--text-primary)' }}>
          My Tasks
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>
          {openCount} open · {groupedTasks.completed.length} completed
        </p>
      </header>

      {myTasks.length === 0 ? (
        <div className="card-panel" style={{ borderStyle: 'dashed' }}>
          <EmptyState
            icon={ListChecks}
            title="No tasks to show"
            description="Assigned work and department tasks you can act on will appear here, grouped by due date."
            action={
              <button type="button" className="btn btn-secondary" onClick={() => navigate('/projects')}>
                Browse projects
              </button>
            }
          />
        </div>
      ) : (
        <div>
          <TaskGroup title="Overdue" tasks={groupedTasks.overdue} groupKey="overdue" />
          <TaskGroup title="Due Today" tasks={groupedTasks.today} groupKey="today" />
          <TaskGroup title="Upcoming" tasks={groupedTasks.upcoming} groupKey="upcoming" />
          <TaskGroup title="No Due Date" tasks={groupedTasks.noDueDate} groupKey="noDueDate" />
          <TaskGroup title="Completed" tasks={groupedTasks.completed} groupKey="completed" />
        </div>
      )}
    </div>
  );
};
