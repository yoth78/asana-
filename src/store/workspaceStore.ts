import { create } from 'zustand';
import type {
  Workspace,
  Department,
  Team,
  Project,
  ProjectMember,
  ProjectMemberRole,
  Task,
  Comment,
  ActivityLogEntry,
  PayrollEntry,
  PayrollStatus
} from '../types';
import { fetchWorkspaceBootstrap } from '../api/workspaceApi';
import {
  readWorkspaceCache,
  writeWorkspaceCache,
  type WorkspaceBootstrapPayload
} from '../lib/workspaceCache';
import { queryClient, workspaceQueryKey } from '../lib/queryClient';

interface WorkspaceState {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  departments: Department[];
  teams: Team[];
  projects: Project[];
  currentProject: Project | null;
  projectMembersByProject: Record<string, ProjectMember[]>;
  commentsByTask: Record<string, Comment[]>;
  subtasksByParent: Record<string, Task[]>;
  tasks: Task[];
  comments: Comment[];
  activityLog: ActivityLogEntry[];
  payroll: PayrollEntry[];
  /** True while a network bootstrap is in flight (cache may already be shown). */
  isHydrating: boolean;

  reset: () => void;
  applyBootstrap: (workspaceId: string, data: WorkspaceBootstrapPayload) => void;
  fetchAllData: (workspaceId: string, options?: { userId?: string; background?: boolean }) => Promise<void>;

  addDepartment: (department: Omit<Department, 'id'>) => Promise<void>;
  updateDepartment: (id: string, department: Partial<Department>) => Promise<void>;
  deleteDepartment: (id: string) => Promise<void>;
  addDepartmentMembers: (departmentId: string, userIds: string[]) => Promise<void>;
  removeDepartmentMember: (departmentId: string, userId: string) => Promise<void>;

  setProjects: (projects: Project[]) => void;
  setCurrentProject: (project: Project | null) => void;
  addProject: (project: Omit<Project, 'id'> & { memberIds?: string[] }) => Promise<void>;
  updateProject: (id: string, project: Partial<Project>) => void;
  deleteProject: (id: string) => Promise<void>;
  fetchProjectMembers: (projectId: string) => Promise<ProjectMember[]>;
  addProjectMember: (projectId: string, userId: string, role?: ProjectMemberRole) => Promise<void>;
  addProjectMembers: (projectId: string, userIds: string[], role?: ProjectMemberRole) => Promise<void>;
  updateProjectMemberRole: (projectId: string, userId: string, role: ProjectMemberRole) => Promise<void>;
  removeProjectMember: (projectId: string, userId: string) => Promise<void>;

  setTasks: (tasks: Task[]) => void;
  addTask: (
    task: Pick<Task, 'title' | 'description' | 'projectId' | 'status' | 'priority' | 'labels'> &
      Partial<Pick<Task, 'assigneeId' | 'dueDate' | 'departmentId' | 'parentTaskId'>>
  ) => Promise<void>;
  updateTask: (id: string, task: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  fetchActivityLog: () => Promise<void>;
  fetchComments: (taskId: string) => Promise<Comment[]>;
  addComment: (taskId: string, content: string, mentionUserIds?: string[]) => Promise<void>;
  deleteComment: (commentId: string, taskId: string) => Promise<void>;
  fetchSubtasks: (parentTaskId: string) => Promise<Task[]>;
  addSubtask: (parentTaskId: string, title: string) => Promise<void>;
  updateSubtask: (id: string, parentTaskId: string, fields: Partial<Task>) => Promise<void>;
  deleteSubtask: (id: string, parentTaskId: string) => Promise<void>;

  updatePayrollStatus: (id: string, status: PayrollStatus) => void;
  addPayrollEntry: (entry: PayrollEntry) => void;

  getTasksByDepartment: (deptId: string) => Task[];
  getTasksByAssignee: (userId: string) => Task[];
  getProjectsByDepartment: (deptId: string) => Project[];
  getProjectMembers: (projectId: string) => ProjectMember[];
}

const getToken = () => localStorage.getItem('token');

const throwOnError = async (res: Response, fallback: string) => {
  if (res.ok) return;
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error || fallback);
};

const EMPTY_PROJECT_MEMBERS: ProjectMember[] = [];

const emptyWorkspaceState = {
  workspaces: [] as Workspace[],
  currentWorkspace: null as Workspace | null,
  departments: [] as Department[],
  teams: [] as Team[],
  projects: [] as Project[],
  currentProject: null as Project | null,
  projectMembersByProject: {} as Record<string, ProjectMember[]>,
  commentsByTask: {} as Record<string, Comment[]>,
  subtasksByParent: {} as Record<string, Task[]>,
  tasks: [] as Task[],
  comments: [] as Comment[],
  activityLog: [] as ActivityLogEntry[],
  payroll: [] as PayrollEntry[],
  isHydrating: false
};

const resolveCurrentWorkspace = (
  workspaceId: string,
  workspaces: Workspace[]
): Workspace =>
  workspaces.find(w => w.id === workspaceId) ||
  workspaces[0] || {
    id: workspaceId,
    name: 'Workspace',
    ownerId: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  ...emptyWorkspaceState,

  reset: () => set({ ...emptyWorkspaceState }),

  applyBootstrap: (workspaceId, data) => {
    const departments = (data.departments || []) as Department[];
    const projects = (data.projects || []) as Project[];
    const tasks = (data.tasks || []) as Task[];
    const workspaces = (data.workspaces || []) as Workspace[];
    const activityLog = (data.activityLog || []) as ActivityLogEntry[];

    set({
      departments,
      projects,
      tasks,
      workspaces,
      currentWorkspace: resolveCurrentWorkspace(workspaceId, workspaces),
      activityLog
    });
  },

  fetchAllData: async (workspaceId, options = {}) => {
    const token = getToken();
    if (!token) return;

    const userId = options.userId;
    if (userId) {
      const cached = readWorkspaceCache(userId, workspaceId);
      if (cached) {
        get().applyBootstrap(workspaceId, cached);
        queryClient.setQueryData(workspaceQueryKey(workspaceId), cached);
      }
    }

    if (!options.background) {
      set({ isHydrating: true });
    }

    try {
      const data = await fetchWorkspaceBootstrap(workspaceId);
      get().applyBootstrap(workspaceId, data);
      queryClient.setQueryData(workspaceQueryKey(workspaceId), data);
      if (userId) writeWorkspaceCache(userId, workspaceId, data);
    } catch (error) {
      console.error('Failed to fetch workspace data', error);
    } finally {
      set({ isHydrating: false });
    }
  },

  addDepartment: async deptData => {
    const token = getToken();
    const res = await fetch('/api/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: deptData.name,
        description: deptData.description,
        color: deptData.color,
        leadId: deptData.adminId || null,
        memberIds: deptData.memberIds || [],
        workspaceId: (deptData as any).workspaceId || get().currentWorkspace?.id
      })
    });
    await throwOnError(res, 'Failed to create department');
    const newDept = await res.json();
    set(state => ({ departments: [...state.departments, newDept] }));
  },

  addDepartmentMembers: async (departmentId, userIds) => {
    const token = getToken();
    const res = await fetch(`/api/departments/${departmentId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userIds })
    });
    await throwOnError(res, 'Failed to add department members');
    const updated: Department = await res.json();
    set(state => ({
      departments: state.departments.map(d => (d.id === departmentId ? { ...d, ...updated } : d))
    }));
  },

  removeDepartmentMember: async (departmentId, userId) => {
    const token = getToken();
    const res = await fetch(`/api/departments/${departmentId}/members/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    await throwOnError(res, 'Failed to remove department member');
    set(state => ({
      departments: state.departments.map(d => {
        if (d.id !== departmentId) return d;
        const memberIds = (d.memberIds || []).filter(id => id !== userId);
        return { ...d, memberIds, memberCount: memberIds.length };
      })
    }));
  },

  updateDepartment: async (id, updatedFields) => {
    const token = getToken();
    const res = await fetch(`/api/departments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: updatedFields.name,
        description: updatedFields.description,
        color: updatedFields.color,
        leadId: updatedFields.adminId === undefined ? undefined : updatedFields.adminId || null
      })
    });
    await throwOnError(res, 'Failed to update department');
    const updated = await res.json();
    set(state => ({
      departments: state.departments.map(dept => (dept.id === id ? { ...dept, ...updated } : dept))
    }));
  },

  deleteDepartment: async id => {
    const token = getToken();
    const res = await fetch(`/api/departments/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    await throwOnError(res, 'Failed to delete department');
    set(state => ({ departments: state.departments.filter(d => d.id !== id) }));
  },

  setProjects: projects => set({ projects }),
  setCurrentProject: project => set({ currentProject: project }),

  addProject: async projectData => {
    const token = getToken();
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: projectData.name,
        description: projectData.description,
        departmentId: (projectData as any).departmentId,
        deptId: (projectData as any).departmentId,
        color: (projectData as any).color,
        workspaceId: projectData.workspaceId,
        memberIds: projectData.memberIds
      })
    });
    await throwOnError(res, 'Failed to create project');
    const newProj = await res.json();
    set(state => ({ projects: [...state.projects, newProj] }));
  },

  updateProject: (id, updatedFields) =>
    set(state => ({
      projects: state.projects.map(proj => (proj.id === id ? { ...proj, ...updatedFields } : proj)),
      currentProject:
        state.currentProject?.id === id
          ? { ...state.currentProject, ...updatedFields }
          : state.currentProject
    })),

  deleteProject: async id => {
    const token = getToken();
    const res = await fetch(`/api/projects/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    await throwOnError(res, 'Failed to delete project');
    set(state => {
      const nextMembers = { ...state.projectMembersByProject };
      delete nextMembers[id];
      return {
        projects: state.projects.filter(p => p.id !== id),
        currentProject: state.currentProject?.id === id ? null : state.currentProject,
        projectMembersByProject: nextMembers
      };
    });
  },

  fetchProjectMembers: async projectId => {
    const token = getToken();
    const res = await fetch(`/api/projects/${projectId}/members`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    await throwOnError(res, 'Failed to load project members');
    const members: ProjectMember[] = await res.json();
    set(state => ({
      projectMembersByProject: { ...state.projectMembersByProject, [projectId]: members },
      projects: state.projects.map(p =>
        p.id === projectId
          ? { ...p, memberIds: members.map(m => m.userId), memberCount: members.length }
          : p
      )
    }));
    return members;
  },

  addProjectMember: async (projectId, userId, role = 'MEMBER') => {
    const token = getToken();
    const res = await fetch(`/api/projects/${projectId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId, role })
    });
    await throwOnError(res, 'Failed to add project member');
    const member: ProjectMember = await res.json();
    set(state => {
      const existing = state.projectMembersByProject[projectId] || [];
      const next = [...existing.filter(m => m.userId !== userId), member];
      return {
        projectMembersByProject: { ...state.projectMembersByProject, [projectId]: next },
        projects: state.projects.map(p =>
          p.id === projectId
            ? { ...p, memberIds: next.map(m => m.userId), memberCount: next.length }
            : p
        )
      };
    });
  },

  addProjectMembers: async (projectId, userIds, role = 'MEMBER') => {
    if (userIds.length === 0) return;
    const token = getToken();
    const res = await fetch(`/api/projects/${projectId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userIds, role })
    });
    await throwOnError(res, 'Failed to add project members');
    const payload = await res.json();
    const added: ProjectMember[] = Array.isArray(payload) ? payload : [payload];
    set(state => {
      const existing = state.projectMembersByProject[projectId] || [];
      const byId = new Map(existing.map(m => [m.userId, m]));
      added.forEach(m => byId.set(m.userId, m));
      const next = [...byId.values()];
      return {
        projectMembersByProject: { ...state.projectMembersByProject, [projectId]: next },
        projects: state.projects.map(p =>
          p.id === projectId
            ? { ...p, memberIds: next.map(m => m.userId), memberCount: next.length }
            : p
        )
      };
    });
  },

  updateProjectMemberRole: async (projectId, userId, role) => {
    const token = getToken();
    const res = await fetch(`/api/projects/${projectId}/members/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ role })
    });
    await throwOnError(res, 'Failed to update project member');
    const member: ProjectMember = await res.json();
    set(state => {
      const existing = state.projectMembersByProject[projectId] || [];
      return {
        projectMembersByProject: {
          ...state.projectMembersByProject,
          [projectId]: existing.map(m => (m.userId === userId ? member : m))
        }
      };
    });
  },

  removeProjectMember: async (projectId, userId) => {
    const token = getToken();
    const res = await fetch(`/api/projects/${projectId}/members/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    await throwOnError(res, 'Failed to remove project member');
    set(state => {
      const existing = state.projectMembersByProject[projectId] || [];
      const next = existing.filter(m => m.userId !== userId);
      return {
        projectMembersByProject: { ...state.projectMembersByProject, [projectId]: next },
        projects: state.projects.map(p =>
          p.id === projectId
            ? { ...p, memberIds: next.map(m => m.userId), memberCount: next.length }
            : p
        )
      };
    });
  },

  setTasks: tasks => set({ tasks }),

  addTask: async taskData => {
    const token = getToken();
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(taskData)
    });
    await throwOnError(res, 'Failed to create task');
    const newTask = await res.json();
    set(state => ({ tasks: [...state.tasks, newTask] }));
    get().fetchActivityLog().catch(() => {});
  },

  updateTask: async (id, updatedFields) => {
    const token = getToken();
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(updatedFields)
    });
    await throwOnError(res, 'Failed to update task');
    set(state => ({
      tasks: state.tasks.map(task => (task.id === id ? { ...task, ...updatedFields } : task))
    }));
    get().fetchActivityLog().catch(() => {});
  },

  deleteTask: async id => {
    const token = getToken();
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    await throwOnError(res, 'Failed to delete task');
    set(state => ({
      tasks: state.tasks.filter(task => task.id !== id && task.parentTaskId !== id),
      subtasksByParent: Object.fromEntries(
        Object.entries(state.subtasksByParent).filter(([parentId]) => parentId !== id)
      )
    }));
  },

  fetchActivityLog: async () => {
    const token = getToken();
    if (!token) return;
    const res = await fetch('/api/activity?limit=50', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;
    const activityLog: ActivityLogEntry[] = await res.json();
    set({ activityLog });
  },

  fetchComments: async taskId => {
    const token = getToken();
    const res = await fetch(`/api/comments/task/${taskId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    await throwOnError(res, 'Failed to load comments');
    const comments: Comment[] = await res.json();
    set(state => ({
      commentsByTask: { ...state.commentsByTask, [taskId]: comments }
    }));
    return comments;
  },

  addComment: async (taskId, content, mentionUserIds) => {
    const token = getToken();
    const res = await fetch(`/api/comments/task/${taskId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content, mentionUserIds })
    });
    await throwOnError(res, 'Failed to post comment');
    const comment: Comment = await res.json();
    set(state => ({
      commentsByTask: {
        ...state.commentsByTask,
        [taskId]: [...(state.commentsByTask[taskId] || []), comment]
      }
    }));
    get().fetchActivityLog().catch(() => {});
  },

  deleteComment: async (commentId, taskId) => {
    const token = getToken();
    const res = await fetch(`/api/comments/${commentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    await throwOnError(res, 'Failed to delete comment');
    set(state => ({
      commentsByTask: {
        ...state.commentsByTask,
        [taskId]: (state.commentsByTask[taskId] || []).filter(c => c.id !== commentId)
      }
    }));
  },

  fetchSubtasks: async parentTaskId => {
    const token = getToken();
    const res = await fetch(`/api/tasks/subtasks/${parentTaskId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    await throwOnError(res, 'Failed to load subtasks');
    const subtasks: Task[] = await res.json();
    set(state => ({
      subtasksByParent: { ...state.subtasksByParent, [parentTaskId]: subtasks },
      tasks: [
        ...state.tasks.filter(t => t.parentTaskId !== parentTaskId),
        ...subtasks
      ]
    }));
    return subtasks;
  },

  addSubtask: async (parentTaskId, title) => {
    const token = getToken();
    const res = await fetch('/api/tasks/subtasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ parentTaskId, title })
    });
    await throwOnError(res, 'Failed to add subtask');
    const subtask: Task = await res.json();
    set(state => ({
      subtasksByParent: {
        ...state.subtasksByParent,
        [parentTaskId]: [...(state.subtasksByParent[parentTaskId] || []), subtask]
      },
      tasks: [...state.tasks, subtask]
    }));
  },

  updateSubtask: async (id, parentTaskId, fields) => {
    const token = getToken();
    const res = await fetch(`/api/tasks/subtasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(fields)
    });
    await throwOnError(res, 'Failed to update subtask');
    const updated: Task = await res.json();
    set(state => ({
      subtasksByParent: {
        ...state.subtasksByParent,
        [parentTaskId]: (state.subtasksByParent[parentTaskId] || []).map(t =>
          t.id === id ? { ...t, ...updated } : t
        )
      },
      tasks: state.tasks.map(t => (t.id === id ? { ...t, ...updated } : t))
    }));
  },

  deleteSubtask: async (id, parentTaskId) => {
    const token = getToken();
    const res = await fetch(`/api/tasks/subtasks/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    await throwOnError(res, 'Failed to delete subtask');
    set(state => ({
      subtasksByParent: {
        ...state.subtasksByParent,
        [parentTaskId]: (state.subtasksByParent[parentTaskId] || []).filter(t => t.id !== id)
      },
      tasks: state.tasks.filter(t => t.id !== id)
    }));
  },

  updatePayrollStatus: (id, status) =>
    set(state => ({
      payroll: state.payroll.map(entry => (entry.id === id ? { ...entry, status } : entry))
    })),

  addPayrollEntry: entry => set(state => ({ payroll: [...state.payroll, entry] })),

  getTasksByDepartment: (deptId: string) => {
    const projectIds = get()
      .projects.filter(
        project =>
          (project as any).departmentId === deptId || (project as any).teamId === deptId
      )
      .map(project => project.id);
    return get().tasks.filter(
      task => projectIds.includes(task.projectId) || (task as any).departmentId === deptId
    );
  },
  getTasksByAssignee: (userId: string) => get().tasks.filter(task => task.assigneeId === userId),
  getProjectsByDepartment: (deptId: string) =>
    get().projects.filter(
      project =>
        (project as any).departmentId === deptId || (project as any).teamId === deptId
    ),
  getProjectMembers: (projectId: string) =>
    get().projectMembersByProject[projectId] ?? EMPTY_PROJECT_MEMBERS
}));
