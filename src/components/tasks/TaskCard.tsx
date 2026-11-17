import React, { useMemo } from 'react';
import type { Task, TaskPriority } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { Calendar, GripVertical } from 'lucide-react';
import { format, isPast, isToday } from 'date-fns';

interface TaskCardProps {
  task: Task;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onClick: () => void;
}

const priorityClass = (priority: TaskPriority) => {
  switch (priority) {
    case 'URGENT':
      return 'task-card-priority-urgent';
    case 'HIGH':
      return 'task-card-priority-high';
    case 'MEDIUM':
      return 'task-card-priority-medium';
    case 'LOW':
      return 'task-card-priority-low';
    default:
      return '';
  }
};

const priorityBadge = (priority: TaskPriority) => {
  switch (priority) {
    case 'URGENT':
      return 'badge-error';
    case 'HIGH':
      return 'badge-warning';
    case 'MEDIUM':
      return 'badge-info';
    case 'LOW':
      return 'badge-success';
    default:
      return 'badge-default';
  }
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('') || '?';

export default function TaskCard({ task, onDragStart, onDragEnd, onClick }: TaskCardProps) {
  const { allUsers } = useAuthStore();

  const assignee = useMemo(
    () => (task.assigneeId ? allUsers.find(u => u.id === task.assigneeId) : undefined),
    [allUsers, task.assigneeId]
  );

  let dueClass = '';
  if (task.dueDate) {
    const date = new Date(task.dueDate);
    if (isPast(date) && !isToday(date)) dueClass = 'badge-error';
    else if (isToday(date)) dueClass = 'badge-warning';
  }

  return (
    <div
      id={`task-${task.id}`}
      draggable
      onDragStart={onDragStart as any}
      onDragEnd={onDragEnd as any}
      onClick={onClick}
      className={`task-card ${priorityClass(task.priority)}`}
      style={{ position: 'relative' }}
    >
      <div className="task-card-grip">
        <GripVertical size={16} />
      </div>

      <div className="task-card-title">{task.title}</div>

      {task.labels && task.labels.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.5rem' }}>
          {task.labels.map(label => (
            <span key={label} className="badge badge-default" style={{ fontSize: '0.625rem' }}>
              {label}
            </span>
          ))}
        </div>
      )}

      <div className="task-card-meta">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
          {task.priority !== 'MEDIUM' && (
            <span className={`badge ${priorityBadge(task.priority)}`} style={{ fontSize: '0.625rem' }}>
              {task.priority.charAt(0) + task.priority.slice(1).toLowerCase()}
            </span>
          )}
          {task.dueDate && (
            <span className={`badge ${dueClass || 'badge-default'}`} style={{ fontSize: '0.625rem' }}>
              <Calendar size={10} style={{ marginRight: 4, verticalAlign: -1 }} />
              {format(new Date(task.dueDate), 'MMM d')}
            </span>
          )}
        </div>
        {assignee && (
          <div className="avatar avatar-sm" title={assignee.name} style={{ width: '1.5rem', height: '1.5rem', fontSize: '0.5625rem' }}>
            {initials(assignee.name)}
          </div>
        )}
      </div>
    </div>
  );
}
