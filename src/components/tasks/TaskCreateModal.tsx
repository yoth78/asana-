import React, { useMemo, useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useAuthStore } from '../../store/authStore';
import type { TaskStatus, TaskPriority } from '../../types';
import { Modal } from '../common/Modal';
import { Calendar, User, Layout, Flag, CircleDot } from 'lucide-react';
import toast from 'react-hot-toast';

interface TaskCreateModalProps {
  projectId?: string;
  initialStatus?: TaskStatus;
  onClose: () => void;
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'TODO', label: 'To Do' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'REVIEW', label: 'Review' },
  { value: 'DONE', label: 'Done' },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; color: string }[] = [
  { value: 'LOW', label: 'Low', color: 'var(--success)' },
  { value: 'MEDIUM', label: 'Medium', color: 'var(--accent)' },
  { value: 'HIGH', label: 'High', color: 'var(--warning)' },
  { value: 'URGENT', label: 'Urgent', color: 'var(--error)' },
];

export default function TaskCreateModal({
  projectId: initialProjectId,
  initialStatus = 'TODO',
  onClose,
}: TaskCreateModalProps) {
  const { addTask, projects, getProjectMembers } = useWorkspaceStore();
  const { user, allUsers, getUsersByDepartment } = useAuthStore();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(initialProjectId || projects[0]?.id || '');
  const [status, setStatus] = useState<TaskStatus>(initialStatus);
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const assignableUsers = useMemo(() => {
    if (!user) return [];
    const activeProjectId = projectId || initialProjectId;
    const projectMembers = activeProjectId ? getProjectMembers(activeProjectId) : [];
    if (projectMembers.length > 0) {
      const ids = new Set(projectMembers.map(m => m.userId));
      return allUsers.filter(u => ids.has(u.id));
    }
    if (user.role === 'SUPER_ADMIN') return allUsers;
    return user.departmentId ? getUsersByDepartment(user.departmentId) : [];
  }, [user, allUsers, getUsersByDepartment, getProjectMembers, initialProjectId, projectId]);

  const resetForm = (keepContext = true) => {
    setTitle('');
    setDescription('');
    if (!keepContext) {
      setStatus(initialStatus);
      setPriority('MEDIUM');
      setAssigneeId('');
      setDueDate('');
    }
  };

  const handleSubmit = async (e: React.FormEvent, createAnother = false) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error('Task title is required');
      return;
    }

    if (!projectId) {
      toast.error('Project is required');
      return;
    }

    setIsSubmitting(true);

    try {
      await addTask({
        title: title.trim(),
        description: description.trim(),
        projectId,
        status,
        priority,
        assigneeId: assigneeId || undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        labels: [],
      });

      toast.success('Task created');

      if (createAnother) {
        resetForm(true);
      } else {
        onClose();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create task';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen title="Create task" onClose={onClose} size="lg">
      <form id="task-create-form" onSubmit={e => handleSubmit(e, false)}>
        <div className="form-group" style={{ marginBottom: 'var(--spacing-5)' }}>
          <label className="form-label" htmlFor="task-title">
            Task name <span className="text-error">*</span>
          </label>
          <input
            id="task-title"
            autoFocus
            placeholder="What needs to be done?"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="form-input"
            style={{ fontSize: '1.125rem', fontWeight: 500 }}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 'var(--spacing-4)',
          }}
        >
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="task-project">
              <Layout size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
              Project
            </label>
            <select
              id="task-project"
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="select"
              disabled={!!initialProjectId}
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="task-assignee">
              <User size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
              Assignee
            </label>
            <select
              id="task-assignee"
              value={assigneeId}
              onChange={e => setAssigneeId(e.target.value)}
              className="select"
            >
              <option value="">Unassigned</option>
              {assignableUsers.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="task-due">
              <Calendar size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
              Due date
            </label>
            <input
              id="task-due"
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">
              <CircleDot size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
              Status
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  className={`badge ${status === opt.value ? 'badge-primary' : 'badge-default'}`}
                  style={{ cursor: 'pointer', border: 'none' }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="form-group" style={{ marginTop: 'var(--spacing-4)', marginBottom: 'var(--spacing-4)' }}>
          <label className="form-label">
            <Flag size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
            Priority
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
            {PRIORITY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPriority(opt.value)}
                className={`badge ${priority === opt.value ? 'badge-primary' : 'badge-default'}`}
                style={{
                  cursor: 'pointer',
                  border: priority === opt.value ? `1px solid ${opt.color}` : undefined,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="task-desc">
            Description
          </label>
          <textarea
            id="task-desc"
            placeholder="Add details, links, or context for this task…"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="textarea"
            rows={4}
          />
        </div>
      </form>

      <div className="modal-footer" style={{ margin: '0 calc(-1 * var(--spacing-6)) calc(-1 * var(--spacing-6))' }}>
        <button type="button" onClick={onClose} className="btn btn-ghost" disabled={isSubmitting}>
          Cancel
        </button>
        <button
          type="button"
          onClick={e => handleSubmit(e, true)}
          disabled={isSubmitting}
          className="btn btn-secondary"
        >
          Create & add another
        </button>
        <button
          type="submit"
          form="task-create-form"
          disabled={isSubmitting}
          className="btn btn-primary"
        >
          {isSubmitting ? 'Creating…' : 'Create task'}
        </button>
      </div>
    </Modal>
  );
}
