import React, { useMemo } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { WorkloadChart } from '../dashboard/WorkloadChart';
import { UpcomingDeadlines } from '../dashboard/UpcomingDeadlines';
import { ActivityFeed } from '../dashboard/ActivityFeed';
import type { Task } from '../../types';

interface ProjectDashboardViewProps {
  projectId: string;
}

const isTopLevel = (task: Task) => !task.parentTaskId;

export const ProjectDashboardView: React.FC<ProjectDashboardViewProps> = ({ projectId }) => {
  const { tasks, projects, activityLog } = useWorkspaceStore();

  const projectTasks = useMemo(
    () => tasks.filter(t => t.projectId === projectId && isTopLevel(t)),
    [tasks, projectId]
  );

  const projectActivity = useMemo(() => {
    const taskIds = new Set(projectTasks.map(t => t.id));
    return activityLog.filter(
      a => a.targetId === projectId || taskIds.has(a.targetId)
    );
  }, [activityLog, projectId, projectTasks]);

  const doneCount = projectTasks.filter(t => t.status === 'DONE').length;
  const overdueCount = projectTasks.filter(
    t => t.dueDate && t.status !== 'DONE' && new Date(t.dueDate) < new Date()
  ).length;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="col-span-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] p-4">
          <p className="text-sm text-[var(--text-secondary)] m-0">Total tasks</p>
          <p className="text-2xl font-bold text-[var(--text-primary)] m-0 mt-1">{projectTasks.length}</p>
        </div>
        <div className="col-span-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] p-4">
          <p className="text-sm text-[var(--text-secondary)] m-0">Completed</p>
          <p className="text-2xl font-bold text-[var(--success)] m-0 mt-1">{doneCount}</p>
        </div>
        <div className="col-span-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] p-4">
          <p className="text-sm text-[var(--text-secondary)] m-0">Overdue</p>
          <p className="text-2xl font-bold text-[var(--error)] m-0 mt-1">{overdueCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6" style={{ minHeight: '320px' }}>
        <WorkloadChart tasks={projectTasks} />
        <UpcomingDeadlines tasks={projectTasks} projects={projects} />
      </div>

      <div className="mt-6" style={{ minHeight: '280px' }}>
        <ActivityFeed activities={projectActivity} />
      </div>
    </div>
  );
};
