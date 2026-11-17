import { Router } from 'express';
import { prisma } from '../index';
import { FEATURE_KEYS, isFeatureKey } from '../entitlements';
import {
  authenticatePlatform,
  clientIp,
  requirePlatformRole,
  writePlatformAudit
} from './auth';

const router = Router();

router.get('/flags', authenticatePlatform, async (_req, res) => {
  try {
    const rows = await prisma.globalFeatureFlag.findMany();
    const byKey = new Map(rows.map(r => [r.featureKey, r]));
    const flags = FEATURE_KEYS.map(key => {
      const row = byKey.get(key);
      return {
        featureKey: key,
        disabled: row?.disabled ?? false,
        reason: row?.reason ?? null,
        updatedAt: row?.updatedAt ?? null,
        updatedByStaffId: row?.updatedByStaffId ?? null
      };
    });
    res.json({ flags });
  } catch (error) {
    console.error('List global flags error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put(
  '/flags/:featureKey',
  authenticatePlatform,
  requirePlatformRole('OWNER'),
  async (req: any, res) => {
    try {
      const featureKey = String(req.params.featureKey || '');
      if (!isFeatureKey(featureKey)) {
        return res.status(400).json({ error: 'Unknown feature key' });
      }
      const disabled = Boolean(req.body?.disabled);
      const reason = req.body?.reason != null ? String(req.body.reason).trim() || null : null;

      const before = await prisma.globalFeatureFlag.findUnique({ where: { featureKey } });
      const flag = await prisma.globalFeatureFlag.upsert({
        where: { featureKey },
        create: {
          featureKey,
          disabled,
          reason,
          updatedByStaffId: req.platformStaff.id
        },
        update: {
          disabled,
          reason,
          updatedByStaffId: req.platformStaff.id
        }
      });

      await writePlatformAudit({
        staffId: req.platformStaff.id,
        action: disabled ? 'GLOBAL_FLAG_DISABLE' : 'GLOBAL_FLAG_ENABLE',
        targetType: 'GlobalFeatureFlag',
        targetId: flag.id,
        before: before
          ? { featureKey, disabled: before.disabled, reason: before.reason }
          : null,
        after: { featureKey, disabled, reason },
        ip: clientIp(req)
      });

      res.json({ flag });
    } catch (error) {
      console.error('Put global flag error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/** Lightweight abuse / risk signals — not a full security console. */
router.get('/abuse/summary', authenticatePlatform, async (_req, res) => {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      unverifiedRecent,
      recentWorkspaces,
      pendingInvites24h,
      suspendedCount,
      recentMailFails,
      otpHoldingUsers
    ] = await Promise.all([
      prisma.user.findMany({
        where: { isVerified: false, createdAt: { gte: since7d } },
        select: { id: true, email: true, name: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 40
      }),
      prisma.workspace.findMany({
        where: { createdAt: { gte: since7d } },
        include: {
          owner: { select: { email: true, name: true } },
          _count: { select: { teams: true, projects: true, members: true, invitations: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 60
      }),
      prisma.invitation.count({
        where: { createdAt: { gte: since24h }, status: 'pending' }
      }),
      prisma.workspace.count({ where: { status: 'SUSPENDED' } }),
      prisma.outboundEmailRecipient.findMany({
        where: { status: 'FAILED', createdAt: { gte: since7d } },
        select: { email: true, error: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 30
      }),
      prisma.user.findMany({
        where: {
          verificationToken: { not: null },
          updatedAt: { gte: since24h }
        },
        select: { id: true, email: true, name: true, isVerified: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 40
      })
    ]);

    const emptyOrSparse = recentWorkspaces
      .filter(
        w =>
          w._count.teams === 0 &&
          w._count.projects === 0 &&
          (w._count.members <= 1 || w.plan === 'FREE')
      )
      .map(w => ({
        id: w.id,
        name: w.name,
        status: w.status,
        plan: w.plan,
        createdAt: w.createdAt,
        ownerEmail: w.owner.email,
        members: w._count.members,
        invitations: w._count.invitations,
        teams: w._count.teams,
        projects: w._count.projects
      }));

    const inviteHeavy = recentWorkspaces
      .filter(w => w._count.invitations >= 8)
      .map(w => ({
        id: w.id,
        name: w.name,
        status: w.status,
        ownerEmail: w.owner.email,
        invitations: w._count.invitations,
        members: w._count.members,
        createdAt: w.createdAt
      }));

    res.json({
      generatedAt: new Date().toISOString(),
      counters: {
        unverifiedUsers7d: unverifiedRecent.length,
        emptyWorkspaces7d: emptyOrSparse.length,
        pendingInvites24h,
        suspendedWorkspaces: suspendedCount,
        otpPendingUpdated24h: otpHoldingUsers.length,
        failedOutbound7d: recentMailFails.length
      },
      unverifiedUsers: unverifiedRecent,
      otpPendingUsers: otpHoldingUsers,
      emptyWorkspaces: emptyOrSparse.slice(0, 40),
      inviteHeavyWorkspaces: inviteHeavy.slice(0, 20),
      failedOutbound: recentMailFails
    });
  } catch (error) {
    console.error('Abuse summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/abuse/workspaces/:id/suspend',
  authenticatePlatform,
  requirePlatformRole('OWNER', 'BILLING'),
  async (req: any, res) => {
    try {
      const id = String(req.params.id);
      const reason = String(req.body?.reason || 'Abuse console').trim();
      const existing = await prisma.workspace.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Workspace not found' });

      const workspace = await prisma.workspace.update({
        where: { id },
        data: { status: 'SUSPENDED' }
      });

      await writePlatformAudit({
        staffId: req.platformStaff.id,
        action: 'WORKSPACE_SUSPEND_ABUSE',
        workspaceId: id,
        targetType: 'Workspace',
        targetId: id,
        before: { status: existing.status },
        after: { status: 'SUSPENDED', reason },
        ip: clientIp(req)
      });

      res.json({ workspace });
    } catch (error) {
      console.error('Abuse suspend error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
