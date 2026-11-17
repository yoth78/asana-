import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../index';
import { rateLimit } from '../rateLimit';
import {
  authenticatePlatform,
  clientIp,
  getPlatformJwtSecret,
  requirePlatformRole,
  signPlatformAccessToken,
  signPlatformMfaToken,
  writePlatformAudit
} from './auth';
import { buildOtpauthUri, generateBase32Secret, verifyTotp } from './totp';
import {
  FEATURE_KEYS,
  PLAN_DEFINITIONS,
  isFeatureKey,
  normalizePlan,
  resolveEntitlements
} from '../entitlements';
import opsRoutes from './ops.routes';
import growthRoutes from './growth.routes';
import mailRoutes from './mail.routes';
import phase4Routes from './phase4.routes';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  name: 'platform-login'
});
const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  name: 'platform-mfa'
});


const mapStaff = (s: {
  id: string;
  email: string;
  name: string | null;
  role: string;
  mfaEnabled: boolean;
}) => ({
  id: s.id,
  email: s.email,
  name: s.name,
  role: s.role,
  mfaEnabled: s.mfaEnabled
});

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', surface: 'platform' });
});

router.get('/meta/plans', authenticatePlatform, async (_req, res) => {
  try {
    const { listPlanCatalog } = await import('../entitlements');
    const plans = await listPlanCatalog();
    res.json({
      plans: Object.fromEntries(plans.map(p => [p.planId, { features: p.features, limits: p.limits }])),
      featureKeys: FEATURE_KEYS,
      catalog: plans
    });
  } catch (error) {
    console.error('Meta plans error:', error);
    res.json({
      plans: PLAN_DEFINITIONS,
      featureKeys: FEATURE_KEYS
    });
  }
});

router.post('/auth/login', loginLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const staff = await prisma.platformUser.findUnique({ where: { email } });
    if (!staff || staff.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, staff.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    await writePlatformAudit({
      staffId: staff.id,
      action: 'STAFF_LOGIN_PASSWORD_OK',
      ip: clientIp(req)
    });

    if (!staff.mfaEnabled || !staff.mfaSecret) {
      const setupToken = signPlatformMfaToken(staff.id);
      return res.json({
        requiresMfaSetup: true,
        setupToken,
        staff: mapStaff(staff)
      });
    }

    const mfaToken = signPlatformMfaToken(staff.id);
    return res.json({
      requiresMfa: true,
      mfaToken,
      staff: mapStaff(staff)
    });
  } catch (error) {
    console.error('Platform login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/auth/mfa/verify', mfaLimiter, async (req, res) => {
  try {
    const mfaToken = String(req.body?.mfaToken || '');
    const code = String(req.body?.code || '');
    if (!mfaToken || !code) {
      return res.status(400).json({ error: 'mfaToken and code are required' });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(mfaToken, getPlatformJwtSecret());
    } catch {
      return res.status(401).json({ error: 'MFA session expired. Sign in again.' });
    }
    if (decoded.typ !== 'platform_mfa' || !decoded.staffId) {
      return res.status(401).json({ error: 'Invalid MFA token' });
    }

    const staff = await prisma.platformUser.findUnique({ where: { id: decoded.staffId } });
    if (!staff || staff.status !== 'ACTIVE' || !staff.mfaSecret || !staff.mfaEnabled) {
      return res.status(401).json({ error: 'MFA not available for this account' });
    }

    if (!verifyTotp(staff.mfaSecret, code)) {
      await writePlatformAudit({
        staffId: staff.id,
        action: 'STAFF_MFA_FAILED',
        ip: clientIp(req)
      });
      return res.status(401).json({ error: 'Invalid authenticator code' });
    }

    await prisma.platformUser.update({
      where: { id: staff.id },
      data: { lastLoginAt: new Date() }
    });

    const token = signPlatformAccessToken(staff);
    await writePlatformAudit({
      staffId: staff.id,
      action: 'STAFF_LOGIN_SUCCESS',
      ip: clientIp(req)
    });

    res.json({ token, staff: mapStaff(staff) });
  } catch (error) {
    console.error('Platform MFA verify error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/auth/mfa/setup/start', mfaLimiter, async (req, res) => {
  try {
    const setupToken = String(req.body?.setupToken || '');
    let decoded: any;
    try {
      decoded = jwt.verify(setupToken, getPlatformJwtSecret());
    } catch {
      return res.status(401).json({ error: 'Setup session expired. Sign in again.' });
    }
    if (decoded.typ !== 'platform_mfa' || !decoded.staffId) {
      return res.status(401).json({ error: 'Invalid setup token' });
    }

    const staff = await prisma.platformUser.findUnique({ where: { id: decoded.staffId } });
    if (!staff || staff.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'Staff not found' });
    }
    if (staff.mfaEnabled) {
      return res.status(400).json({ error: 'MFA already enabled' });
    }

    const secret = generateBase32Secret();
    await prisma.platformUser.update({
      where: { id: staff.id },
      data: { mfaSecret: secret, mfaEnabled: false }
    });

    res.json({
      secret,
      otpauthUrl: buildOtpauthUri({ secret, email: staff.email })
    });
  } catch (error) {
    console.error('Platform MFA setup start error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/auth/mfa/setup/confirm', mfaLimiter, async (req, res) => {
  try {
    const setupToken = String(req.body?.setupToken || '');
    const code = String(req.body?.code || '');
    let decoded: any;
    try {
      decoded = jwt.verify(setupToken, getPlatformJwtSecret());
    } catch {
      return res.status(401).json({ error: 'Setup session expired. Sign in again.' });
    }
    if (decoded.typ !== 'platform_mfa' || !decoded.staffId) {
      return res.status(401).json({ error: 'Invalid setup token' });
    }

    const staff = await prisma.platformUser.findUnique({ where: { id: decoded.staffId } });
    if (!staff?.mfaSecret || staff.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Start MFA setup first' });
    }
    if (!verifyTotp(staff.mfaSecret, code)) {
      return res.status(401).json({ error: 'Invalid authenticator code' });
    }

    const updated = await prisma.platformUser.update({
      where: { id: staff.id },
      data: { mfaEnabled: true, lastLoginAt: new Date() }
    });

    const token = signPlatformAccessToken(updated);
    await writePlatformAudit({
      staffId: staff.id,
      action: 'STAFF_MFA_ENROLLED',
      ip: clientIp(req)
    });

    res.json({ token, staff: mapStaff(updated) });
  } catch (error) {
    console.error('Platform MFA setup confirm error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/auth/me', authenticatePlatform, async (req: any, res) => {
  res.json({ staff: req.platformStaff });
});

router.get('/workspaces', authenticatePlatform, async (req, res) => {
  try {
    const q = String(req.query.query || '').trim();
    const take = Math.min(Number(req.query.limit) || 30, 100);

    const workspaces = await prisma.workspace.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { id: { equals: q } },
              { slug: { contains: q, mode: 'insensitive' } },
              { billingEmail: { contains: q, mode: 'insensitive' } },
              { owner: { email: { contains: q, mode: 'insensitive' } } },
              { owner: { name: { contains: q, mode: 'insensitive' } } }
            ]
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        owner: { select: { id: true, email: true, name: true } },
        subscription: true,
        _count: { select: { members: true } }
      }
    });

    res.json({
      workspaces: workspaces.map(w => ({
        id: w.id,
        name: w.name,
        slug: w.slug,
        status: w.status,
        plan: w.plan,
        billingEmail: w.billingEmail,
        createdAt: w.createdAt,
        owner: w.owner,
        memberCount: w._count.members,
        subscription: w.subscription
      }))
    });
  } catch (error) {
    console.error('Platform list workspaces error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/workspaces/:id', authenticatePlatform, async (req, res) => {
  try {
    const id = String(req.params.id);
    const workspace = await prisma.workspace.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, email: true, name: true } },
        subscription: true,
        featureOverrides: true,
        members: {
          include: {
            user: { select: { id: true, email: true, name: true, isVerified: true } }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    const entitlements = await resolveEntitlements(id);
    res.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        status: workspace.status,
        plan: workspace.plan,
        billingEmail: workspace.billingEmail,
        createdAt: workspace.createdAt,
        owner: workspace.owner,
        subscription: workspace.subscription,
        overrides: workspace.featureOverrides,
        members: workspace.members.map(m => ({
          id: m.id,
          role: m.role,
          status: m.status,
          user: m.user,
          createdAt: m.createdAt
        }))
      },
      entitlements
    });
  } catch (error) {
    console.error('Platform get workspace error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch(
  '/workspaces/:id',
  authenticatePlatform,
  requirePlatformRole('BILLING', 'OWNER'),
  async (req: any, res) => {
    try {
      const id = String(req.params.id);
      const workspace = await prisma.workspace.findUnique({
        where: { id },
        include: { subscription: true }
      });
      if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

      const before = {
        plan: workspace.plan,
        status: workspace.status,
        billingEmail: workspace.billingEmail,
        slug: workspace.slug
      };

      const data: Record<string, unknown> = {};
      if (req.body?.plan != null) data.plan = normalizePlan(req.body.plan);
      if (req.body?.status != null) {
        const status = String(req.body.status).toUpperCase();
        if (!['ACTIVE', 'PENDING', 'SUSPENDED'].includes(status)) {
          return res.status(400).json({ error: 'Invalid status' });
        }
        data.status = status;
      }
      if (req.body?.billingEmail !== undefined) {
        data.billingEmail = req.body.billingEmail ? String(req.body.billingEmail).trim() : null;
      }
      if (req.body?.slug !== undefined) {
        data.slug = req.body.slug ? String(req.body.slug).trim().toLowerCase() : null;
      }

      if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: 'No changes provided' });
      }

      const updated = await prisma.workspace.update({ where: { id }, data: data as any });

      if (data.plan && workspace.subscription) {
        await prisma.subscription.update({
          where: { workspaceId: id },
          data: {
            plan: String(data.plan),
            seats: PLAN_DEFINITIONS[normalizePlan(String(data.plan))].limits.maxSeats
          }
        });
      }

      await writePlatformAudit({
        staffId: req.platformStaff.id,
        action: 'WORKSPACE_PATCH',
        workspaceId: id,
        targetType: 'Workspace',
        targetId: id,
        before,
        after: data,
        ip: clientIp(req)
      });

      const entitlements = await resolveEntitlements(id);
      res.json({ workspace: updated, entitlements });
    } catch (error) {
      console.error('Platform patch workspace error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.put(
  '/workspaces/:id/overrides',
  authenticatePlatform,
  requirePlatformRole('BILLING', 'OWNER'),
  async (req: any, res) => {
    try {
      const id = String(req.params.id);
      const workspace = await prisma.workspace.findUnique({ where: { id } });
      if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

      const items = Array.isArray(req.body?.overrides) ? req.body.overrides : null;
      if (!items) return res.status(400).json({ error: 'overrides array required' });

      const before = await prisma.workspaceFeatureOverride.findMany({ where: { workspaceId: id } });

      for (const item of items) {
        const featureKey = String(item.featureKey || '');
        if (!isFeatureKey(featureKey)) {
          return res.status(400).json({ error: `Unknown featureKey: ${featureKey}` });
        }
        if (typeof item.enabled !== 'boolean') {
          return res.status(400).json({ error: `enabled boolean required for ${featureKey}` });
        }

        const expiresAt = item.expiresAt ? new Date(item.expiresAt) : null;
        await prisma.workspaceFeatureOverride.upsert({
          where: {
            workspaceId_featureKey: { workspaceId: id, featureKey }
          },
          create: {
            workspaceId: id,
            featureKey,
            enabled: item.enabled,
            reason: item.reason ? String(item.reason) : null,
            expiresAt,
            setByStaffId: req.platformStaff.id
          },
          update: {
            enabled: item.enabled,
            reason: item.reason ? String(item.reason) : null,
            expiresAt,
            setByStaffId: req.platformStaff.id
          }
        });
      }

      if (req.body?.removeKeys && Array.isArray(req.body.removeKeys)) {
        const removeKeys = req.body.removeKeys.filter((k: string) => isFeatureKey(k));
        if (removeKeys.length) {
          await prisma.workspaceFeatureOverride.deleteMany({
            where: { workspaceId: id, featureKey: { in: removeKeys } }
          });
        }
      }

      const after = await prisma.workspaceFeatureOverride.findMany({ where: { workspaceId: id } });
      await writePlatformAudit({
        staffId: req.platformStaff.id,
        action: 'WORKSPACE_OVERRIDES_PUT',
        workspaceId: id,
        targetType: 'WorkspaceFeatureOverride',
        targetId: id,
        before,
        after,
        ip: clientIp(req)
      });

      const entitlements = await resolveEntitlements(id);
      res.json({ overrides: after, entitlements });
    } catch (error) {
      console.error('Platform overrides error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.patch(
  '/workspaces/:id/members/:memberId',
  authenticatePlatform,
  requirePlatformRole('BILLING', 'OWNER'),
  async (req: any, res) => {
    try {
      const workspaceId = String(req.params.id);
      const memberId = String(req.params.memberId);
      const status = String(req.body?.status || '').toUpperCase();
      if (!['ACTIVE', 'DISABLED'].includes(status)) {
        return res.status(400).json({ error: 'status must be ACTIVE or DISABLED' });
      }

      const member = await prisma.workspaceMember.findFirst({
        where: { id: memberId, workspaceId }
      });
      if (!member) return res.status(404).json({ error: 'Member not found' });

      const updated = await prisma.workspaceMember.update({
        where: { id: memberId },
        data: { status }
      });

      await writePlatformAudit({
        staffId: req.platformStaff.id,
        action: 'MEMBER_STATUS_PATCH',
        workspaceId,
        targetType: 'WorkspaceMember',
        targetId: memberId,
        before: { status: member.status },
        after: { status },
        ip: clientIp(req)
      });

      res.json({ member: updated });
    } catch (error) {
      console.error('Platform member patch error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get('/audit', authenticatePlatform, async (req, res) => {
  try {
    const workspaceId = req.query.workspaceId ? String(req.query.workspaceId) : undefined;
    const take = Math.min(Number(req.query.limit) || 50, 200);

    const logs = await prisma.platformAuditLog.findMany({
      where: workspaceId ? { workspaceId } : undefined,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        staff: { select: { id: true, email: true, name: true } }
      }
    });

    res.json({ logs });
  } catch (error) {
    console.error('Platform audit list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.use(opsRoutes);
router.use(growthRoutes);
router.use(mailRoutes);
router.use(phase4Routes);

export default router;
