import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useAuthStore } from '../../store/authStore';
import type { Task, TaskStatus, TaskPriority, User } from '../../types';
import {
  X, Check, Clock, User as UserIcon, Tag, CircleDot,
  MessageSquare, Trash2, CheckSquare, Plus
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';

interface TaskDetailPanelProps {
  taskId: string;
  onClose: () => void;
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'TODO', label: 'To Do' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'REVIEW', label: 'Review' },
  { value: 'DONE', label: 'Done' },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; badge: string }[] = [
  { value: 'LOW', label: 'Low', badge: 'badge-success' },
  { value: 'MEDIUM', label: 'Medium', badge: 'badge-default' },
  { value: 'HIGH', label: 'High', badge: 'badge-warning' },
  { value: 'URGENT', label: 'Urgent', badge: 'badge-error' },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('') || '?';

const extractMentionIds = (content: string, users: User[]) => {
  const ids = new Set<string>();
  for (const u of users) {
    if (u.name && content.includes(`@${u.name}`)) ids.add(u.id);
  }
  return [...ids];
};

export default function TaskDetailPanel({ taskId, onClose }: TaskDetailPanelProps) {
  const {
    tasks,
    updateTask,
    deleteTask,
    getProjectMembers,
    commentsByTask,
    subtasksByParent,
    fetchComments,
    addComment,
    deleteComment,
    fetchSubtasks,
    addSubtask,
    updateSubtask,
    deleteSubtask,
  } = useWorkspaceStore();
  const { user, allUsers, getUsersByDepartment } = useAuthStore();
  const task = tasks.find(t => t.id === taskId);

  const comments = commentsByTask[taskId];
  const subtasks = subtasksByParent[taskId];

  const assignableUsers = useMemo(() => {
    if (!user || !task) return [];
    const projectMembers = getProjectMembers(task.projectId);
    if (projectMembers.length > 0) {
      const ids = new Set(projectMembers.map(m => m.userId));
      return allUsers.filter(u => ids.has(u.id));
    }
    if (user.role === 'SUPER_ADMIN') return allUsers;
    return user.departmentId ? getUsersByDepartment(user.departmentId) : [];
  }, [user, allUsers, getUsersByDepartment, getProjectMembers, task]);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(task?.title || '');
  const [descriptionValue, setDescriptionValue] = useState(task?.description || '');
  const [commentText, setCommentText] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [showSubtaskInput, setShowSubtaskInput] = useState(false);

  useEffect(() => {
    if (!taskId) return;
    fetchComments(taskId).catch(() => {});
    fetchSubtasks(taskId).catch(() => {});
  }, [taskId, fetchComments, fetchSubtasks]);

  useEffect(() => {
    if (task) {
      setTitleValue(task.title);
      setDescriptionValue(task.description || '');
    }
  }, [task?.id, task?.title, task?.description]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (!task) return null;

  const commentList = comments ?? [];
  const subtaskList = subtasks ?? [];
  const priorityMeta = PRIORITY_OPTIONS.find(p => p.value === task.priority);

  const applyUpdate = async (fields: Partial<Task>) => {
    try {
      await updateTask(task.id, fields);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update task';
      toast.error(message);
    }
  };

  const handleTitleSubmit = () => {
    if (titleValue.trim() && titleValue !== task.title) {
      applyUpdate({ title: titleValue.trim() });
    } else {
      setTitleValue(task.title);
    }
    setIsEditingTitle(false);
  };

  const handleMarkComplete = () => {
    applyUpdate({ status: task.status === 'DONE' ? 'TODO' : 'DONE' });
  };

  const handlePostComment = async () => {
    const text = commentText.trim();
    if (!text) return;
    setIsPostingComment(true);
    try {
      const mentionUserIds = extractMentionIds(text, allUsers);
      await addComment(task.id, text, mentionUserIds);
      setCommentText('');
      toast.success('Comment posted');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to post comment';
      toast.error(message);
    } finally {
      setIsPostingComment(false);
    }
  };

  const handleAddSubtask = async () => {
    const title = newSubtaskTitle.trim();
    if (!title) return;
    try {
      await addSubtask(task.id, title);
      setNewSubtaskTitle('');
      setShowSubtaskInput(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add subtask';
      toast.error(message);
    }
  };

  const toggleSubtask = async (subtask: Task) => {
    try {
      await updateSubtask(subtask.id, task.id, {
        status: subtask.status === 'DONE' ? 'TODO' : 'DONE',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update subtask';
      toast.error(message);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    try {
      await deleteTask(task.id);
      toast.success('Task deleted');
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete task';
      toast.error(message);
    }
  };

  return createPortal(
    <>
      <div className="task-detail-overlay" onClick={onClose} aria-hidden />
      <aside className="task-detail-panel" role="dialog" aria-label="Task details">
        <div className="task-detail-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)' }}>
            {priorityMeta && (
              <span className={`badge ${priorityMeta.badge}`}>{priorityMeta.label}</span>
            )}
            <button type="button" onClick={handleMarkComplete} className="btn btn-secondary btn-sm">
              <Check size={14} />
              {task.status === 'DONE' ? 'Mark incomplete' : 'Mark complete'}
            </button>
          </div>
          <button type="button" onClick={onClose} className="btn btn-icon btn-ghost" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="task-detail-content custom-scrollbar">
          {isEditingTitle ? (
            <input
              autoFocus
              value={titleValue}
              onChange={e => setTitleValue(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={e => e.key === 'Enter' && handleTitleSubmit()}
              className="task-detail-title-input"
            />
          ) : (
            <h2 className="task-detail-title" onClick={() => setIsEditingTitle(true)}>
              {task.title}
            </h2>
          )}

          <div className="task-detail-meta">
            <div className="task-detail-field">
              <span className="task-detail-field-label">
                <UserIcon size={14} /> Assignee
              </span>
              <select
                value={task.assigneeId || ''}
                onChange={e => applyUpdate({ assigneeId: e.target.value || undefined })}
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

            <div className="task-detail-field">
              <span className="task-detail-field-label">
                <Clock size={14} /> Due date
              </span>
              <input
                type="date"
                value={task.dueDate ? task.dueDate.split('T')[0] : ''}
                onChange={e =>
                  applyUpdate({
                    dueDate: e.target.value ? new Date(e.target.value).toISOString() : null,
                  })
                }
                className="form-input"
              />
            </div>

            <div className="task-detail-field">
              <span className="task-detail-field-label">
                <Tag size={14} /> Priority
              </span>
              <div className="task-detail-pills">
                {PRIORITY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => applyUpdate({ priority: opt.value })}
                    className={`badge task-detail-pill ${task.priority === opt.value ? opt.badge : 'badge-default'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="task-detail-field">
              <span className="task-detail-field-label">
                <CircleDot size={14} /> Status
              </span>
              <div className="task-detail-pills">
                {STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => applyUpdate({ status: opt.value })}
                    className={`badge task-detail-pill ${task.status === opt.value ? 'badge-primary' : 'badge-default'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="task-detail-section">
            <h3 className="task-detail-section-title">Description</h3>
            <textarea
              value={descriptionValue}
              onChange={e => setDescriptionValue(e.target.value)}
              onBlur={() => applyUpdate({ description: descriptionValue })}
              placeholder="Add more details to this task…"
              className="textarea"
              rows={5}
            />
          </div>

          <div className="task-detail-section">
            <div className="task-detail-section-header">
              <h3 className="task-detail-section-title">
                <CheckSquare size={16} />
                Subtasks
                {subtaskList.length > 0 && (
                  <span className="badge badge-default" style={{ fontWeight: 400 }}>
                    {subtaskList.filter(s => s.status === 'DONE').length}/{subtaskList.length}
                  </span>
                )}
              </h3>
              <button
                type="button"
                onClick={() => setShowSubtaskInput(true)}
                className="btn btn-ghost btn-sm"
              >
                <Plus size={14} /> Add subtask
              </button>
            </div>
            <div className="subtask-list">
              {subtaskList.map(subtask => (
                <div key={subtask.id} className="subtask-row">
                  <input
                    type="checkbox"
                    checked={subtask.status === 'DONE'}
                    onChange={() => toggleSubtask(subtask)}
                  />
                  <span className={subtask.status === 'DONE' ? 'done' : ''}>{subtask.title}</span>
                  <button
                    type="button"
                    onClick={() =>
                      deleteSubtask(subtask.id, task.id).catch(err =>
                        toast.error(err.message || 'Failed to delete subtask')
                      )
                    }
                    className="btn btn-icon btn-ghost"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {showSubtaskInput && (
                <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
                  <input
                    autoFocus
                    value={newSubtaskTitle}
                    onChange={e => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAddSubtask();
                      if (e.key === 'Escape') setShowSubtaskInput(false);
                    }}
                    placeholder="Subtask title"
                    className="form-input"
                    style={{ flex: 1 }}
                  />
                  <button type="button" onClick={handleAddSubtask} className="btn btn-primary btn-sm">
                    Add
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="task-detail-section">
            <h3 className="task-detail-section-title" style={{ marginBottom: 'var(--spacing-4)' }}>
              <MessageSquare size={16} /> Comments
            </h3>

            <div className="task-comment-list">
              {commentList.length === 0 ? (
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>
                  No comments yet. Start the conversation.
                </p>
              ) : (
                commentList.map(comment => (
                  <div key={comment.id} className="task-comment">
                    <div className="avatar avatar-sm">{initials(comment.userName || '?')}</div>
                    <div className="task-comment-body">
                      <div className="task-comment-meta">
                        <span>{comment.userName}</span>
                        <span>{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}</span>
                        {(comment.userId === user?.id || user?.role === 'SUPER_ADMIN') && (
                          <button
                            type="button"
                            onClick={() =>
                              deleteComment(comment.id, task.id).catch(err =>
                                toast.error(err.message || 'Failed to delete')
                              )
                            }
                            className="btn btn-icon btn-ghost"
                            style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                      <p className="task-comment-text">{comment.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="task-comment-composer">
              <div className="avatar avatar-sm">{initials(user?.name || 'ME')}</div>
              <div className="task-comment-composer-inner">
                <textarea
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Ask a question or post an update… Use @Name to mention someone"
                  className="textarea"
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    disabled={!commentText.trim() || isPostingComment}
                    onClick={handlePostComment}
                    className="btn btn-primary btn-sm"
                  >
                    {isPostingComment ? 'Posting…' : 'Comment'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="task-detail-footer">
          <span>Created on {format(new Date(task.createdAt), 'MMM d, yyyy')}</span>
          <button type="button" onClick={handleDelete} className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }}>
            <Trash2 size={14} /> Delete task
          </button>
        </div>
      </aside>
    </>,
    document.body
  );
}
