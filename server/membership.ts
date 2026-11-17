import { prisma } from './index';

export type Actor = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  workspaceId: string;
  teamId: string | null;
  isVerified: boolean;
  profilePic: string | null;
  position: string | null;
  birthday: string | null;
  bankAccount: string | null;
  dateJoined: string | null;
  bio: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const ROLE_RANK: Record<string, number> = {
  SUPER_ADMIN: 3,
  ADMIN: 2,
  MEMBER: 1
};

const VALID_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MEMBER'] as const;

/** Normalize role strings from DB (handles stray spaces / casing). */
export const normalizeRole = (role: string | null | undefined): string => {
  if (!role) return 'MEMBER';
  const r = role.trim().toUpperCase().replace(/\s+/g, '_');
  if (r === 'SUPERADMIN') return 'SUPER_ADMIN';
  if (VALID_ROLES.includes(r as (typeof VALID_ROLES)[number])) return r;
  return r;
};

export const isAdminRole = (role: string | null | undefined) => {
  const r = normalizeRole(role);
  return r === 'SUPER_ADMIN' || r === 'ADMIN';
};

/** Super/department admin, or the workspace owner (even if membership row is stale). */
export const isWorkspaceAdmin = async (actor: Actor): Promise<boolean> => {
  if (isAdminRole(actor.role)) return true;
  const owned = await prisma.workspace.findFirst({
    where: { id: actor.workspaceId, ownerId: actor.id }
  });
  return Boolean(owned);
};

const profileFromUser = (user: any, role: string, workspaceId: string, teamId: string | null): Actor => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: normalizeRole(role),
  workspaceId,
  teamId,
  isVerified: user.isVerified,
  profilePic: user.profilePic,
  position: user.position,
  birthday: user.birthday,
  bankAccount: user.bankAccount,
  dateJoined: user.dateJoined,
  bio: user.bio,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

export const mapActorForClient = (actor: Actor) => ({
  id: actor.id,
  email: actor.email,
  name: actor.name,
  role: actor.role,
  isVerified: actor.isVerified,
  profilePic: actor.profilePic,
  position: actor.position,
  birthday: actor.birthday,
  bankAccount: actor.bankAccount,
  dateJoined: actor.dateJoined,
  bio: actor.bio,
  workspaceId: actor.workspaceId,
  departmentId: actor.teamId || undefined,
  createdAt: actor.createdAt,
  updatedAt: actor.updatedAt
});

const primaryTeamId = (
  teamMemberships: Array<{ teamId: string; role: string; team: { workspaceId: string } }>,
  workspaceId: string
) => {
  const inWorkspace = teamMemberships.filter(m => m.team.workspaceId === workspaceId);
  const lead = inWorkspace.find(m => m.role === 'LEAD');
  return (lead || inWorkspace[0])?.teamId || null;
};

const pickPrimaryMembership = async (
  userId: string,
  memberships: Array<{ workspaceId: string; role: string; createdAt: Date }>
) => {
  if (memberships.length === 0) return null;
  if (memberships.length === 1) return memberships[0];

  const ownedWorkspaces = await prisma.workspace.findMany({
    where: { ownerId: userId },
    select: { id: true }
  });
  const ownedIds = new Set(ownedWorkspaces.map(w => w.id));

  const ownedMembership = memberships.find(m => ownedIds.has(m.workspaceId));
  if (ownedMembership) return ownedMembership;

  return memberships.reduce((best, current) => {
    const bestRank = ROLE_RANK[normalizeRole(best.role)] || 0;
    const currentRank = ROLE_RANK[normalizeRole(current.role)] || 0;
    if (currentRank > bestRank) return current;
    if (currentRank === bestRank && current.createdAt > best.createdAt) return current;
    return best;
  });
};

/** If user owns the workspace but membership role is wrong, fix the row once. */
const healOwnerMembership = async (
  userId: string,
  membership: { workspaceId: string; role: string }
) => {
  const owned = await prisma.workspace.findFirst({
    where: { id: membership.workspaceId, ownerId: userId }
  });
  if (!owned) return membership.role;

  if (normalizeRole(membership.role) !== 'SUPER_ADMIN') {
    await prisma.workspaceMember.updateMany({
      where: { workspaceId: membership.workspaceId, userId },
      data: { role: 'SUPER_ADMIN' }
    });
    return 'SUPER_ADMIN';
  }
  return membership.role;
};

export const getActor = async (userId: string): Promise<Actor | null> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } },
      teamMemberships: { include: { team: { select: { workspaceId: true } } } }
    }
  });
  if (!user) return null;

  let membership =
    user.activeWorkspaceId
      ? user.memberships.find(m => m.workspaceId === user.activeWorkspaceId) || null
      : null;

  if (!membership) {
    const primary = await pickPrimaryMembership(userId, user.memberships);
    membership = primary
      ? user.memberships.find(m => m.workspaceId === primary.workspaceId) || null
      : null;
  }
  if (!membership) return null;

  // Keep preference aligned when falling back to primary.
  if (user.activeWorkspaceId !== membership.workspaceId) {
    await prisma.user.update({
      where: { id: userId },
      data: { activeWorkspaceId: membership.workspaceId }
    }).catch(() => null);
  }

  const role = await healOwnerMembership(userId, membership);

  return profileFromUser(
    user,
    role,
    membership.workspaceId,
    primaryTeamId(user.teamMemberships, membership.workspaceId)
  );
};

export const setActiveWorkspace = async (userId: string, workspaceId: string) => {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId, workspaceId, status: 'ACTIVE' }
  });
  if (!membership) return null;

  await prisma.user.update({
    where: { id: userId },
    data: { activeWorkspaceId: workspaceId }
  });

  return getActor(userId);
};

export const listUserWorkspaces = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeWorkspaceId: true }
  });

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId, status: 'ACTIVE' },
    include: { workspace: { select: { id: true, name: true, status: true, plan: true } } },
    orderBy: { createdAt: 'asc' }
  });

  const activeId =
    (user?.activeWorkspaceId &&
      memberships.some(m => m.workspaceId === user.activeWorkspaceId) &&
      user.activeWorkspaceId) ||
    memberships[0]?.workspaceId ||
    null;

  return memberships.map(m => ({
    id: m.workspace.id,
    name: m.workspace.name,
    status: m.workspace.status,
    plan: m.workspace.plan,
    role: normalizeRole(m.role),
    isActive: m.workspaceId === activeId
  }));
};

export const getActorForWorkspace = async (
  userId: string,
  workspaceId: string
): Promise<Actor | null> => {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId, workspaceId, status: 'ACTIVE' },
    include: {
      user: {
        include: {
          teamMemberships: { include: { team: { select: { workspaceId: true } } } }
        }
      }
    }
  });
  if (!membership) return null;
  return profileFromUser(
    membership.user,
    membership.role,
    membership.workspaceId,
    primaryTeamId(membership.user.teamMemberships, workspaceId)
  );
};

export const listWorkspaceActors = async (workspaceId: string): Promise<Actor[]> => {
  const memberships = await prisma.workspaceMember.findMany({
    where: { workspaceId, status: 'ACTIVE' },
    include: {
      user: {
        include: {
          teamMemberships: { include: { team: { select: { workspaceId: true } } } }
        }
      }
    }
  });
  return memberships
    .filter(m => m.user.isVerified)
    .map(m =>
      profileFromUser(
        m.user,
        m.role,
        m.workspaceId,
        primaryTeamId(m.user.teamMemberships, workspaceId)
      )
    );
};

export const addWorkspaceMember = async (userId: string, workspaceId: string, role: string) => {
  return prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId, userId } },
    create: { userId, workspaceId, role, status: 'ACTIVE' },
    update: { role, status: 'ACTIVE' }
  });
};

export const setUserDepartment = async (userId: string, workspaceId: string, teamId: string | null) => {
  const current = await prisma.teamMember.findMany({
    where: { userId, team: { workspaceId } }
  });
  const toRemove = current.filter(m => m.teamId !== teamId);
  if (toRemove.length > 0) {
    await prisma.teamMember.deleteMany({ where: { id: { in: toRemove.map(m => m.id) } } });
  }
  if (teamId) {
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId, userId } },
      create: { teamId, userId, role: 'MEMBER' },
      update: {}
    });
  }
};

export const ensureTeamLeadMembership = async (team: { id: string; leadId: string | null }) => {
  if (!team.leadId) return;
  await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId: team.id, userId: team.leadId } },
    create: { teamId: team.id, userId: team.leadId, role: 'LEAD' },
    update: { role: 'LEAD' }
  });
};

export const isUserInWorkspace = async (userId: string, workspaceId: string) => {
  const row = await prisma.workspaceMember.findFirst({
    where: { userId, workspaceId, status: 'ACTIVE' }
  });
  return Boolean(row);
};

export const addProjectMember = async (
  projectId: string,
  userId: string,
  role: 'ADMIN' | 'MEMBER' = 'MEMBER'
) => {
  return prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId, role },
    update: { role }
  });
};

export const getProjectMembership = async (projectId: string, userId: string) => {
  return prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } }
  });
};

/**
 * Prisma `where` for projects a user may list.
 * - SUPER_ADMIN: all workspace projects
 * - ADMIN: projects in their department, or projects they belong to
 * - MEMBER: only projects they are explicitly assigned to
 */
export const visibleProjectsWhere = (actor: Actor) => {
  if (actor.role === 'SUPER_ADMIN') {
    return { workspaceId: actor.workspaceId };
  }
  if (actor.role === 'ADMIN') {
    return {
      workspaceId: actor.workspaceId,
      OR: [
        ...(actor.teamId ? [{ teamId: actor.teamId }] : []),
        { members: { some: { userId: actor.id } } }
      ]
    };
  }
  return {
    workspaceId: actor.workspaceId,
    members: { some: { userId: actor.id } }
  };
};

/** Whether the actor may open / read a specific project. */
export const canViewProject = async (
  actor: Actor,
  project: { id: string; workspaceId: string; teamId: string | null }
) => {
  if (actor.workspaceId !== project.workspaceId) return false;
  if (actor.role === 'SUPER_ADMIN') return true;
  if (actor.role === 'ADMIN' && actor.teamId && project.teamId === actor.teamId) return true;
  const membership = await getProjectMembership(project.id, actor.id);
  return Boolean(membership);
};

/** Workspace super admin, department admin for that project, or project ADMIN. */
export const canManageProjectMembers = async (
  actor: Actor,
  project: { id: string; workspaceId: string; teamId: string | null }
) => {
  if (actor.workspaceId !== project.workspaceId) return false;
  if (actor.role === 'SUPER_ADMIN') return true;
  if (actor.role === 'ADMIN' && actor.teamId && project.teamId === actor.teamId) return true;
  const membership = await getProjectMembership(project.id, actor.id);
  return membership?.role === 'ADMIN';
};

export const mapProjectMemberForClient = (row: {
  id: string;
  projectId: string;
  userId: string;
  role: string;
  createdAt: Date;
  user: { id: string; name: string | null; email: string; profilePic: string | null };
}) => ({
  id: row.id,
  projectId: row.projectId,
  userId: row.userId,
  role: row.role as 'ADMIN' | 'MEMBER',
  name: row.user.name || row.user.email,
  email: row.user.email,
  profilePic: row.user.profilePic || undefined,
  createdAt: row.createdAt.toISOString()
});
