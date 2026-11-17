import type { Project, User } from '../types';

/** Projects a user is allowed to see in the UI. */
export function isProjectVisibleToUser(
  project: Project & { teamId?: string },
  user: Pick<User, 'id' | 'role' | 'departmentId'>
): boolean {
  if (user.role === 'SUPER_ADMIN') return true;

  const memberIds = project.memberIds || [];
  if (memberIds.includes(user.id)) return true;

  // Department admins see all projects in their department.
  if (user.role === 'ADMIN' && user.departmentId) {
    return (
      project.departmentId === user.departmentId ||
      project.teamId === user.departmentId
    );
  }

  // Regular members: only explicitly assigned projects.
  return false;
}

export function filterVisibleProjects(
  projects: Project[],
  user: Pick<User, 'id' | 'role' | 'departmentId'> | null | undefined
): Project[] {
  if (!user) return [];
  return projects.filter(p => isProjectVisibleToUser(p, user));
}
