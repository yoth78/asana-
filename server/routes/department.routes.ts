import { Router } from 'express';
import { prisma } from '../index';
import { authenticate } from './auth.routes';
import { ensureTeamLeadMembership, isUserInWorkspace, setUserDepartment } from '../membership';
import { ensureDepartmentChannel } from '../chat.service';

const router = Router();
router.use(authenticate);

const DEFAULT_COLOR = '#6C5CE7';

const mapDepartmentForClient = (team: any) => {
  const memberRows = Array.isArray(team.teamMembers) ? team.teamMembers : [];
  return {
    id: team.id,
    name: team.name,
    description: team.description || `${team.name} Department`,
    color: team.color || DEFAULT_COLOR,
    adminId: team.leadId,
    memberIds: memberRows.map((m: any) => m.userId),
    memberCount: memberRows.length,
    budget: 0,
    expenses: 0,
    goals: [],
    createdAt: team.createdAt,
    updatedAt: team.updatedAt
  };
};

const departmentInclude = { lead: true, teamMembers: true };

router.get('/:workspaceId', async (req: any, res) => {
  try {
    const { workspaceId } = req.params;
    if (workspaceId !== req.actor.workspaceId) {
      return res.status(403).json({ error: 'Cannot list departments in another workspace' });
    }
    const teams = await prisma.team.findMany({
      where: { workspaceId },
      include: departmentInclude
    });
    res.json(teams.map(mapDepartmentForClient));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: any, res) => {
  try {
    const { name, leadId, color, description, memberIds } = req.body;
    const actor = req.actor;
    if (actor.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Only a Super Admin can create a department' });
    }

    const workspaceId = actor.workspaceId;
    const nextLeadId = leadId || null;
    if (nextLeadId && !(await isUserInWorkspace(nextLeadId, workspaceId))) {
      return res.status(400).json({ error: 'Invalid department lead for this workspace' });
    }

    const extraMemberIds: string[] = Array.isArray(memberIds)
      ? [...new Set(memberIds.filter((id: unknown) => typeof id === 'string'))]
      : [];

    for (const userId of extraMemberIds) {
      if (!(await isUserInWorkspace(userId, workspaceId))) {
        return res.status(400).json({ error: 'All members must already belong to this company' });
      }
    }

    const team = await prisma.team.create({
      data: {
        name,
        workspaceId,
        leadId: nextLeadId,
        color: color || null,
        description: description || null
      }
    });

    await ensureTeamLeadMembership(team);

    const allMemberIds = new Set(extraMemberIds);
    if (nextLeadId) allMemberIds.add(nextLeadId);

    for (const userId of allMemberIds) {
      await prisma.teamMember.upsert({
        where: { teamId_userId: { teamId: team.id, userId } },
        create: {
          teamId: team.id,
          userId,
          role: userId === nextLeadId ? 'LEAD' : 'MEMBER'
        },
        update: userId === nextLeadId ? { role: 'LEAD' } : {}
      });
      await setUserDepartment(userId, workspaceId, team.id);
    }

    await ensureDepartmentChannel(team.id);

    const withMembers = await prisma.team.findUnique({
      where: { id: team.id },
      include: departmentInclude
    });

    res.status(201).json(mapDepartmentForClient(withMembers ?? team));
  } catch (error) {
    console.error('Dept creation error:', error);
    res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

const canManageDepartmentMembers = (actor: { role: string; teamId: string | null }, teamId: string) => {
  if (actor.role === 'SUPER_ADMIN') return true;
  return actor.role === 'ADMIN' && actor.teamId === teamId;
};

router.get('/:id/members', async (req: any, res) => {
  try {
    const { id } = req.params;
    const actor = req.actor;

    const team = await prisma.team.findUnique({ where: { id } });
    if (!team || team.workspaceId !== actor.workspaceId) {
      return res.status(404).json({ error: 'Department not found' });
    }

    const rows = await prisma.teamMember.findMany({
      where: { teamId: id },
      include: {
        user: { select: { id: true, name: true, email: true, profilePic: true } }
      },
      orderBy: { createdAt: 'asc' }
    });

    res.json(
      rows.map(row => ({
        id: row.id,
        departmentId: row.teamId,
        userId: row.userId,
        role: row.role,
        name: row.user.name || row.user.email,
        email: row.user.email,
        profilePic: row.user.profilePic || undefined,
        createdAt: row.createdAt.toISOString()
      }))
    );
  } catch (error) {
    console.error('List department members error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/members', async (req: any, res) => {
  try {
    const { id } = req.params;
    const { userId, userIds } = req.body || {};
    const actor = req.actor;

    const team = await prisma.team.findUnique({ where: { id } });
    if (!team || team.workspaceId !== actor.workspaceId) {
      return res.status(404).json({ error: 'Department not found' });
    }
    if (!canManageDepartmentMembers(actor, id)) {
      return res.status(403).json({ error: 'Not allowed to manage this department' });
    }

    const ids: string[] = Array.isArray(userIds)
      ? userIds.filter((v: unknown) => typeof v === 'string')
      : userId
        ? [userId]
        : [];

    if (ids.length === 0) {
      return res.status(400).json({ error: 'Pick at least one company member to add' });
    }

    for (const uid of ids) {
      if (!(await isUserInWorkspace(uid, actor.workspaceId))) {
        return res.status(400).json({ error: 'All members must already belong to this company' });
      }
    }

    for (const uid of ids) {
      await prisma.teamMember.upsert({
        where: { teamId_userId: { teamId: id, userId: uid } },
        create: {
          teamId: id,
          userId: uid,
          role: team.leadId === uid ? 'LEAD' : 'MEMBER'
        },
        update: {}
      });
      await setUserDepartment(uid, actor.workspaceId, id);
    }

    await ensureDepartmentChannel(id);

    const withMembers = await prisma.team.findUnique({
      where: { id },
      include: departmentInclude
    });

    res.status(201).json(mapDepartmentForClient(withMembers ?? team));
  } catch (error) {
    console.error('Add department members error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/members/:userId', async (req: any, res) => {
  try {
    const { id, userId } = req.params;
    const actor = req.actor;

    const team = await prisma.team.findUnique({ where: { id } });
    if (!team || team.workspaceId !== actor.workspaceId) {
      return res.status(404).json({ error: 'Department not found' });
    }
    if (!canManageDepartmentMembers(actor, id)) {
      return res.status(403).json({ error: 'Not allowed to manage this department' });
    }

    if (team.leadId === userId) {
      return res.status(400).json({
        error: 'Cannot remove the department lead. Change the lead first, then remove them.'
      });
    }

    await prisma.teamMember.deleteMany({ where: { teamId: id, userId } });
    await setUserDepartment(userId, actor.workspaceId, null);
    await ensureDepartmentChannel(id);

    res.status(204).send();
  } catch (error) {
    console.error('Remove department member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id', async (req: any, res) => {
  try {
    const { id } = req.params;
    const { name, description, color, leadId } = req.body || {};
    const actor = req.actor;
    const workspaceId = actor.workspaceId;

    const team = await prisma.team.findUnique({ where: { id } });
    if (!team) return res.status(404).json({ error: 'Department not found' });
    if (team.workspaceId !== workspaceId) {
      return res.status(403).json({ error: 'Department is not in your workspace' });
    }

    const isDepartmentAdmin = actor.role === 'ADMIN' && actor.teamId === team.id;
    if (actor.role !== 'SUPER_ADMIN' && !isDepartmentAdmin) {
      return res.status(403).json({ error: 'Not allowed to update this department' });
    }

    const data: any = {};
    if (name !== undefined && name !== null && name !== '') data.name = String(name);
    if (description !== undefined) data.description = description || null;
    if (color !== undefined) data.color = color || null;
    if (leadId !== undefined) {
      const nextLeadId = leadId || null;
      if (nextLeadId && !(await isUserInWorkspace(nextLeadId, workspaceId))) {
        return res.status(400).json({ error: 'Invalid department lead for this workspace' });
      }
      data.leadId = nextLeadId;
    }

    const updated = await prisma.team.update({
      where: { id },
      data
    });

    await ensureTeamLeadMembership(updated);
    await ensureDepartmentChannel(updated.id);

    const withMembers = await prisma.team.findUnique({
      where: { id },
      include: departmentInclude
    });

    res.json(mapDepartmentForClient(withMembers ?? updated));
  } catch (error) {
    console.error('Dept update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    const { id } = req.params;
    const actor = req.actor;
    if (actor.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Only a Super Admin can delete a department' });
    }

    const workspaceId = actor.workspaceId;
    const team = await prisma.team.findUnique({ where: { id } });
    if (!team) return res.status(404).json({ error: 'Department not found' });
    if (team.workspaceId !== workspaceId) {
      return res.status(403).json({ error: 'Department is not in your workspace' });
    }

    const [memberCount, projectCount] = await Promise.all([
      prisma.teamMember.count({ where: { teamId: id } }),
      prisma.project.count({ where: { teamId: id } })
    ]);

    if (memberCount > 0 || projectCount > 0) {
      const parts: string[] = [];
      if (memberCount > 0) parts.push(`${memberCount} member${memberCount === 1 ? '' : 's'}`);
      if (projectCount > 0) parts.push(`${projectCount} project${projectCount === 1 ? '' : 's'}`);
      return res.status(409).json({
        error: `Cannot delete department: ${parts.join(' and ')} ${
          memberCount + projectCount === 1 ? 'is' : 'are'
        } still assigned to it. Move or remove them first.`
      });
    }

    await prisma.team.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Dept delete error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
