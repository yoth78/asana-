import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../index';
import {
  authenticatePlatform,
  clientIp,
  requirePlatformRole,
  writePlatformAudit
} from './auth';
import { verifyTotp } from './totp';
import {
  PLAN_DEFINITIONS,
  ensureFreeSubscription,
  isFeatureKey,
  normalizePlan,
  resolveEntitlements
} from '../entitlements';
import { addWorkspaceMember } from '../membership';
import { ensureWorkspaceChannel } from '../chat.service';
import { isSegmentId, resolveSegmentTargets } from './segments';

const router = Router();

const PRODUCT_JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

const SUB_STATUSES = ['INACTIVE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED'] as const;
const PAY_STATUSES = ['PENDING', 'PAID', 'FAILED', 'CANCELED'] as const;

async function verifyStaffMfa(staffId: string, code: string) {
  const staff = await prisma.platformUser.findUnique({ where: { id: staffId } });
  if (!staff?.mfaEnabled || !staff.mfaSecret) {
    return { ok: false as const, error: 'MFA must be enabled for this action' };
  }
  if (!verifyTotp(staff.mfaSecret, code)) {
    return { ok: false as const, error: 'Invalid authenticator code' };
  }
  return { ok: true as const };
}

router.patch(
  '/workspaces/:id/subscription',
  authenticatePlatform,
  requirePlatformRole('BILLING', 'OWNER'),
  async (req: any, res) => {
    try {
      const workspaceId = String(req.params.id);
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: { subscription: true }
      });
      if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

      const before = workspace.subscription;
      const data: Record<string, unknown> = {};

      if (req.body?.plan != null) data.plan = normalizePlan(req.body.plan);
      if (req.body?.status != null) {
        const status = String(req.body.status).toUpperCase();
        if (!SUB_STATUSES.includes(status as any)) {
          return res.status(400).json({ error: 'Invalid subscription status' });
        }
        data.status = status;
      }
      if (req.body?.seats != null) {
        const seats = Number(req.body.seats);
        if (!Number.isFinite(seats) || seats < 1 || seats > 10000) {
          return res.status(400).json({ error: 'Invalid seats' });
        }
        data.seats = Math.floor(seats);
      }
      if (req.body?.renewBlocked != null) data.renewBlocked = Boolean(req.body.renewBlocked);
      if (req.body?.currentPeriodEnd !== undefined) {
        data.currentPeriodEnd = req.body.currentPeriodEnd
          ? new Date(req.body.currentPeriodEnd)
          : null;
      }
      if (req.body?.provider != null) data.provider = String(req.body.provider);

      if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: 'No changes provided' });
      }

      const plan = normalizePlan(String(data.plan || workspace.plan));
      if (data.plan) {
        await prisma.workspace.update({ where: { id: workspaceId }, data: { plan } });
        if (data.seats == null) {
          data.seats = PLAN_DEFINITIONS[plan].limits.maxSeats;
        }
      }

      const subscription = workspace.subscription
        ? await prisma.subscription.update({
            where: { workspaceId },
            data: data as any
          })
        : await prisma.subscription.create({
            data: {
              workspaceId,
              plan,
              status: String(data.status || 'INACTIVE'),
              seats: Number(data.seats || PLAN_DEFINITIONS[plan].limits.maxSeats),
              renewBlocked: Boolean(data.renewBlocked ?? false),
              provider: String(data.provider || 'NONE'),
              currentPeriodEnd: (data.currentPeriodEnd as Date | null) ?? null
            }
          });

      await writePlatformAudit({
        staffId: req.platformStaff.id,
        action: 'SUBSCRIPTION_PATCH',
        workspaceId,
        targetType: 'Subscription',
        targetId: subscription.id,
        before,
        after: subscription,
        ip: clientIp(req)
      });

      const entitlements = await resolveEntitlements(workspaceId);
      res.json({ subscription, entitlements });
    } catch (error) {
      console.error('Subscription patch error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get('/workspaces/:id/payments', authenticatePlatform, async (req, res) => {
  try {
    const workspaceId = String(req.params.id);
    const payments = await prisma.payment.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json({ payments });
  } catch (error) {
    console.error('List payments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/workspaces/:id/payments',
  authenticatePlatform,
  requirePlatformRole('BILLING', 'OWNER'),
  async (req: any, res) => {
    try {
      const workspaceId = String(req.params.id);
      const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
      if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

      const amount = Number(req.body?.amount);
      const provider = String(req.body?.provider || 'OTHER').trim();
      const providerReference = String(
        req.body?.providerReference || `manual-${Date.now()}`
      ).trim();
      const currency = String(req.body?.currency || 'ETB').trim().toUpperCase();
      const status = String(req.body?.status || 'PAID').toUpperCase();
      const purpose = String(req.body?.purpose || 'PLAN').toUpperCase();

      if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({ error: 'Invalid amount' });
      }
      if (!PAY_STATUSES.includes(status as any)) {
        return res.status(400).json({ error: 'Invalid payment status' });
      }

      const payment = await prisma.payment.create({
        data: {
          workspaceId,
          provider,
          providerReference,
          amount,
          currency,
          status,
          purpose
        }
      });

      await writePlatformAudit({
        staffId: req.platformStaff.id,
        action: 'PAYMENT_CREATE',
        workspaceId,
        targetType: 'Payment',
        targetId: payment.id,
        after: payment,
        ip: clientIp(req)
      });

      res.status(201).json({ payment });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return res.status(400).json({ error: 'providerReference already exists for this provider' });
      }
      console.error('Create payment error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.patch(
  '/workspaces/:id/payments/:paymentId',
  authenticatePlatform,
  requirePlatformRole('BILLING', 'OWNER'),
  async (req: any, res) => {
    try {
      const workspaceId = String(req.params.id);
      const paymentId = String(req.params.paymentId);
      const existing = await prisma.payment.findFirst({
        where: { id: paymentId, workspaceId }
      });
      if (!existing) return res.status(404).json({ error: 'Payment not found' });

      const status = String(req.body?.status || '').toUpperCase();
      if (!PAY_STATUSES.includes(status as any)) {
        return res.status(400).json({ error: 'Invalid payment status' });
      }

      const payment = await prisma.payment.update({
        where: { id: paymentId },
        data: { status }
      });

      await writePlatformAudit({
        staffId: req.platformStaff.id,
        action: 'PAYMENT_STATUS_PATCH',
        workspaceId,
        targetType: 'Payment',
        targetId: paymentId,
        before: { status: existing.status },
        after: { status },
        ip: clientIp(req)
      });

      res.json({ payment });
    } catch (error) {
      console.error('Patch payment error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/workspaces/:id/promos/grant-chat',
  authenticatePlatform,
  requirePlatformRole('BILLING', 'OWNER'),
  async (req: any, res) => {
    try {
      const workspaceId = String(req.params.id);
      const days = Math.min(Math.max(Number(req.body?.days) || 30, 1), 365);
      const reason = String(req.body?.reason || `Promo: chat ${days} days`).trim();
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      const override = await prisma.workspaceFeatureOverride.upsert({
        where: {
          workspaceId_featureKey: { workspaceId, featureKey: 'chat' }
        },
        create: {
          workspaceId,
          featureKey: 'chat',
          enabled: true,
          reason,
          expiresAt,
          setByStaffId: req.platformStaff.id
        },
        update: {
          enabled: true,
          reason,
          expiresAt,
          setByStaffId: req.platformStaff.id
        }
      });

      await writePlatformAudit({
        staffId: req.platformStaff.id,
        action: 'PROMO_GRANT_CHAT',
        workspaceId,
        targetType: 'WorkspaceFeatureOverride',
        targetId: override.id,
        after: override,
        ip: clientIp(req)
      });

      const entitlements = await resolveEntitlements(workspaceId);
      res.json({ override, entitlements });
    } catch (error) {
      console.error('Promo grant chat error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/workspaces/:id/promos/grant-feature',
  authenticatePlatform,
  requirePlatformRole('BILLING', 'OWNER'),
  async (req: any, res) => {
    try {
      const workspaceId = String(req.params.id);
      const featureKey = String(req.body?.featureKey || '');
      if (!isFeatureKey(featureKey)) {
        return res.status(400).json({ error: 'Invalid featureKey' });
      }
      const days = Math.min(Math.max(Number(req.body?.days) || 30, 1), 365);
      const reason = String(req.body?.reason || `Promo: ${featureKey} ${days} days`).trim();
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      const override = await prisma.workspaceFeatureOverride.upsert({
        where: { workspaceId_featureKey: { workspaceId, featureKey } },
        create: {
          workspaceId,
          featureKey,
          enabled: true,
          reason,
          expiresAt,
          setByStaffId: req.platformStaff.id
        },
        update: {
          enabled: true,
          reason,
          expiresAt,
          setByStaffId: req.platformStaff.id
        }
      });

      await writePlatformAudit({
        staffId: req.platformStaff.id,
        action: 'PROMO_GRANT_FEATURE',
        workspaceId,
        targetType: 'WorkspaceFeatureOverride',
        targetId: override.id,
        after: override,
        ip: clientIp(req)
      });

      res.json({ override, entitlements: await resolveEntitlements(workspaceId) });
    } catch (error) {
      console.error('Promo grant feature error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get('/workspaces/:id/notes', authenticatePlatform, async (req, res) => {
  try {
    const workspaceId = String(req.params.id);
    const notes = await prisma.workspaceSupportNote.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: { staff: { select: { id: true, email: true, name: true } } },
      take: 100
    });
    res.json({ notes });
  } catch (error) {
    console.error('List notes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/workspaces/:id/notes', authenticatePlatform, async (req: any, res) => {
  try {
    const workspaceId = String(req.params.id);
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Note body is required' });

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    const note = await prisma.workspaceSupportNote.create({
      data: {
        workspaceId,
        staffId: req.platformStaff.id,
        body
      },
      include: { staff: { select: { id: true, email: true, name: true } } }
    });

    await writePlatformAudit({
      staffId: req.platformStaff.id,
      action: 'SUPPORT_NOTE_CREATE',
      workspaceId,
      targetType: 'WorkspaceSupportNote',
      targetId: note.id,
      ip: clientIp(req)
    });

    res.status(201).json({ note });
  } catch (error) {
    console.error('Create note error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/join-requests', authenticatePlatform, async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
    const requests = await prisma.workspaceJoinRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        reviewedBy: { select: { id: true, email: true, name: true } },
        workspace: { select: { id: true, name: true } }
      }
    });
    res.json({ requests });
  } catch (error) {
    console.error('List join requests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/join-requests/:id/approve',
  authenticatePlatform,
  requirePlatformRole('BILLING', 'OWNER'),
  async (req: any, res) => {
    try {
      const id = String(req.params.id);
      const joinReq = await prisma.workspaceJoinRequest.findUnique({ where: { id } });
      if (!joinReq) return res.status(404).json({ error: 'Request not found' });
      if (joinReq.status !== 'PENDING') {
        return res.status(400).json({ error: 'Request is not pending' });
      }

      const email = joinReq.contactEmail.toLowerCase();
      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        const passwordHash = await (await import('bcryptjs')).hash(
          `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          10
        );
        user = await prisma.user.create({
          data: {
            email,
            name: joinReq.contactName,
            passwordHash,
            isVerified: true
          }
        });
      } else if (!user.isVerified) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { isVerified: true, verificationToken: null }
        });
      }

      const workspace = await prisma.workspace.create({
        data: {
          name: joinReq.companyName,
          ownerId: user.id,
          plan: 'FREE',
          status: 'ACTIVE',
          billingEmail: email
        }
      });
      await addWorkspaceMember(user.id, workspace.id, 'SUPER_ADMIN');
      await ensureWorkspaceChannel(workspace.id);
      await ensureFreeSubscription(workspace.id);

      const updated = await prisma.workspaceJoinRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          workspaceId: workspace.id,
          reviewedById: null
        }
      });

      await writePlatformAudit({
        staffId: req.platformStaff.id,
        action: 'JOIN_REQUEST_APPROVE',
        workspaceId: workspace.id,
        targetType: 'WorkspaceJoinRequest',
        targetId: id,
        after: { workspaceId: workspace.id, userId: user.id },
        ip: clientIp(req)
      });

      res.json({ request: updated, workspace, ownerUserId: user.id });
    } catch (error) {
      console.error('Approve join request error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/join-requests/:id/reject',
  authenticatePlatform,
  requirePlatformRole('BILLING', 'OWNER'),
  async (req: any, res) => {
    try {
      const id = String(req.params.id);
      const joinReq = await prisma.workspaceJoinRequest.findUnique({ where: { id } });
      if (!joinReq) return res.status(404).json({ error: 'Request not found' });
      if (joinReq.status !== 'PENDING') {
        return res.status(400).json({ error: 'Request is not pending' });
      }

      const updated = await prisma.workspaceJoinRequest.update({
        where: { id },
        data: { status: 'REJECTED' }
      });

      await writePlatformAudit({
        staffId: req.platformStaff.id,
        action: 'JOIN_REQUEST_REJECT',
        targetType: 'WorkspaceJoinRequest',
        targetId: id,
        ip: clientIp(req)
      });

      res.json({ request: updated });
    } catch (error) {
      console.error('Reject join request error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get('/newsletter', authenticatePlatform, async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status).toUpperCase() : 'ACTIVE';
    const subscribers = await prisma.newsletterSubscriber.findMany({
      where: status === 'ALL' ? undefined : { status },
      orderBy: { subscribedAt: 'desc' },
      take: 500
    });
    res.json({ subscribers });
  } catch (error) {
    console.error('List newsletter error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/segments/export', authenticatePlatform, async (req, res) => {
  try {
    const segment = String(req.query.segment || 'free_empty');
    if (!isSegmentId(segment)) {
      return res.status(400).json({
        error: 'Unknown segment. Use free_empty | signed_up_no_department | newsletter | inactive_14d'
      });
    }

    const targets = await resolveSegmentTargets(segment);
    const rows = targets.map(t => ({
      email: t.email,
      name: t.name || '',
      workspaceId: t.workspaceId || ''
    }));

    const headers = rows.length ? Object.keys(rows[0]) : ['email'];
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => escape((r as any)[h] || '')).join(','))].join(
      '\n'
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="segment-${segment}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Segment export error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/workspaces/:id/impersonate',
  authenticatePlatform,
  requirePlatformRole('SUPPORT', 'BILLING', 'OWNER'),
  async (req: any, res) => {
    try {
      const workspaceId = String(req.params.id);
      const userId = String(req.body?.userId || '');
      const code = String(req.body?.code || '');
      if (!userId || !code) {
        return res.status(400).json({ error: 'userId and MFA code are required' });
      }

      const mfa = await verifyStaffMfa(req.platformStaff.id, code);
      if (!mfa.ok) return res.status(401).json({ error: mfa.error });

      const member = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId, status: 'ACTIVE' },
        include: { user: true }
      });
      if (!member) {
        return res.status(404).json({ error: 'User is not an active member of this workspace' });
      }

      const expiresIn = '30m';
      const token = jwt.sign(
        {
          userId: member.userId,
          impersonation: true,
          staffId: req.platformStaff.id,
          workspaceId
        },
        PRODUCT_JWT_SECRET,
        { expiresIn }
      );

      await writePlatformAudit({
        staffId: req.platformStaff.id,
        action: 'IMPERSONATION_START',
        workspaceId,
        targetType: 'User',
        targetId: userId,
        after: { expiresIn },
        ip: clientIp(req)
      });

      const openUrl = `${FRONTEND_URL}/#/impersonate?token=${encodeURIComponent(token)}`;
      res.json({
        token,
        expiresIn,
        openUrl,
        user: {
          id: member.user.id,
          email: member.user.email,
          name: member.user.name
        }
      });
    } catch (error) {
      console.error('Impersonate error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
