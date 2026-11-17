import React, { useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { TaskStatus } from '../../types';
import TaskCard from './TaskCard';
import TaskDetailPanel from './TaskDetailPanel';
import { Plus } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

interface KanbanBoardProps {
  projectId: string;
  onAddTask?: (status: TaskStatus) => void;
}

const COLUMNS: { id: TaskStatus; title: string; hint: string }[] = [
  { id: 'TODO', title: 'To Do', hint: 'Tasks waiting to start' },
  { id: 'IN_PROGRESS', title: 'In Progress', hint: 'Currently being worked on' },
  { id: 'REVIEW', title: 'Review', hint: 'Ready for review' },
  { id: 'DONE', title: 'Done', hint: 'Completed tasks' },
];

export default function KanbanBoard({ projectId, onAddTask }: KanbanBoardProps) {
  const { tasks, updateTask } = useWorkspaceStore();
  const projectTasks = tasks.filter(t => t.projectId === projectId && !t.parentTaskId);

  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
    setTimeout(() => {
      const el = document.getElementById(`task-${taskId}`);
      if (el) el.style.opacity = '0.5';
    }, 0);
  };

  const handleDragEnd = (_e: React.DragEvent, taskId: string) => {
    const el = document.getElementById(`task-${taskId}`);
    if (el) el.style.opacity = '1';
    setDraggedTaskId(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== status) setDragOverColumn(status);
  };

  const handleDrop = async (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (draggedTaskId) {
      const task = tasks.find(t => t.id === draggedTaskId);
      if (task && task.status !== status) {
        try {
          await updateTask(draggedTaskId, { status });
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : 'Failed to move task');
        }
      }
    }
  };

  return (
    <div className="kanban-container">
      <div className="kanban-board custom-scrollbar">
        {COLUMNS.map(column => {
          const columnTasks = projectTasks.filter(t => t.status === column.id);
          const isDragOver = dragOverColumn === column.id;

          return (
            <div
              key={column.id}
              className={`kanban-column ${isDragOver ? 'kanban-column--drag-over' : ''}`}
              onDragOver={e => handleDragOver(e, column.id)}
              onDragLeave={e => e.preventDefault()}
              onDrop={e => handleDrop(e, column.id)}
            >
              <div className="kanban-column-header">
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>{column.title}</span>
                    <span className="badge badge-default">{columnTasks.length}</span>
                  </div>
                  <p className="kanban-column-hint">{column.hint}</p>
                </div>
                {onAddTask && (
                  <button
                    type="button"
                    onClick={() => onAddTask(column.id)}
                    className="btn btn-icon btn-ghost"
                    title={`Add task to ${column.title}`}
                  >
                    <Plus size={16} />
                  </button>
                )}
              </div>

              <div className="kanban-column-body custom-scrollbar">
                <AnimatePresence>
                  {columnTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onDragStart={e => handleDragStart(e, task.id)}
                      onDragEnd={e => handleDragEnd(e, task.id)}
                      onClick={() => setSelectedTaskId(task.id)}
                    />
                  ))}
                </AnimatePresence>

                {columnTasks.length === 0 && (
                  <button type="button" onClick={() => onAddTask?.(column.id)} className="kanban-add-slot">
                    <Plus size={16} />
                    Add task
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {selectedTaskId && (
          <TaskDetailPanel taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
