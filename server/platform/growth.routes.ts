import { Router } from 'express';
import { prisma } from '../index';
import {
  authenticatePlatform,
  clientIp,
  requirePlatformRole,
  writePlatformAudit
} from './auth';
import {
  FEATURE_KEYS,
  ensurePlanCatalogSeeded,
  getPlanDefinition,
  isFeatureKey,
  listPlanCatalog,
  normalizePlan,
  PLAN_DEFINITIONS,
  type PlanId
} from '../entitlements';
import { sendCampaignEmail } from '../email';
import { isSegmentId, resolveSegmentTargets, SEGMENT_IDS } from './segments';

const router = Router();

router.get('/meta/segments', authenticatePlatform, (_req, res) => {
  res.json({
    segments: SEGMENT_IDS,
    featureKeys: FEATURE_KEYS
  });
});

router.get('/segments/preview', authenticatePlatform, async (req, res) => {
  try {
    const segment = String(req.query.segment || '');
    if (!isSegmentId(segment)) {
      return res.status(400).json({ error: 'Invalid segment' });
    }
    const targets = await resolveSegmentTargets(segment);
    res.json({
      segment,
      count: targets.length,
      sample: targets.slice(0, 20)
    });
  } catch (error) {
    console.error('Segment preview error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Plan catalog ───────────────────────────────────────────────────────────

router.get('/plans', authenticatePlatform, async (_req, res) => {
  try {
    const plans = await listPlanCatalog();
    res.json({ plans, defaults: PLAN_DEFINITIONS });
  } catch (error) {
    console.error('List plans error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put(
  '/plans/:planId',
  authenticatePlatform,
  requirePlatformRole('OWNER'),
  async (req: any, res) => {
    try {
      const planId = normalizePlan(req.params.planId);
      await ensurePlanCatalogSeeded();

      const features = req.body?.features;
      const limits = req.body?.limits;
      if (!features || !limits) {
        return res.status(400).json({ error: 'features and limits are required' });
      }

      for (const key of FEATURE_KEYS) {
        if (typeof features[key] !== 'boolean') {
          return res.status(400).json({ error: `features.${key} must be boolean` });
        }
      }
      for (const key of ['maxSeats', 'maxProjects', 'maxDepartments', 'maxStorageMb'] as const) {
        if (!Number.isFinite(Number(limits[key])) || Number(limits[key]) < 0) {
          return res.status(400).json({ error: `limits.${key} must be a non-negative number` });
        }
      }

      const row = await prisma.planCatalogEntry.upsert({
        where: { planId },
        create: {
          planId,
          featuresJson: JSON.stringify(features),
          limitsJson: JSON.stringify(limits)
        },
        update: {
          featuresJson: JSON.stringify(features),
          limitsJson: JSON.stringify(limits)
        }
      });

      await writePlatformAudit({
        staffId: req.platformStaff.id,
        action: 'PLAN_CATALOG_PUT',
        targetType: 'PlanCatalogEntry',
        targetId: row.id,
        after: { planId, features, limits },
        ip: clientIp(req)
      });

      res.json({
        plan: {
          planId,
          features,
          limits,
          updatedAt: row.updatedAt
        }
      });
    } catch (error) {
      console.error('Put plan error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ─── Coupons ────────────────────────────────────────────────────────────────

router.get('/coupons', authenticatePlatform, async (_req, res) => {
  try {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    res.json({ coupons });
  } catch (error) {
    console.error('List coupons error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/coupons',
  authenticatePlatform,
  requirePlatformRole('BILLING', 'OWNER'),
  async (req: any, res) => {
    try {
      const code = String(req.body?.code || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '');
      if (!code || code.length < 3) {
        return res.status(400).json({ error: 'code must be at least 3 characters' });
      }

      const percentOff =
        req.body?.percentOff != null ? Number(req.body.percentOff) : null;
      const amountOff = req.body?.amountOff != null ? Number(req.body.amountOff) : null;
      if (percentOff == null && amountOff == null) {
        return res.status(400).json({ error: 'percentOff or amountOff required' });
      }
      if (percentOff != null && (percentOff < 1 || percentOff > 100)) {
        return res.status(400).json({ error: 'percentOff must be 1-100' });
      }

      const coupon = await prisma.coupon.create({
        data: {
          code,
          description: req.body?.description ? String(req.body.description) : null,
          percentOff,
          amountOff,
          currency: String(req.body?.currency || 'ETB').toUpperCase(),
          appliesToPlan: req.body?.appliesToPlan
            ? normalizePlan(req.body.appliesToPlan)
            : null,
          maxRedemptions:
            req.body?.maxRedemptions != null ? Number(req.body.maxRedemptions) : null,
          active: req.body?.active !== false,
          expiresAt: req.body?.expiresAt ? new Date(req.body.expiresAt) : null
        }
      });

      await writePlatformAudit({
        staffId: req.platformStaff.id,
        action: 'COUPON_CREATE',
        targetType: 'Coupon',
        targetId: coupon.id,
        after: coupon,
        ip: clientIp(req)
      });

      res.status(201).json({ coupon });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return res.status(400).json({ error: 'Coupon code already exists' });
      }
      console.error('Create coupon error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.patch(
  '/coupons/:id',
  authenticatePlatform,
  requirePlatformRole('BILLING', 'OWNER'),
  async (req: any, res) => {
    try {
      const id = String(req.params.id);
      const existing = await prisma.coupon.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Coupon not found' });

      const data: Record<string, unknown> = {};
      if (req.body?.active != null) data.active = Boolean(req.body.active);
      if (req.body?.description !== undefined) {
        data.description = req.body.description ? String(req.body.description) : null;
      }
      if (req.body?.expiresAt !== undefined) {
        data.expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
      }
      if (req.body?.maxRedemptions !== undefined) {
        data.maxRedemptions =
          req.body.maxRedemptions == null ? null : Number(req.body.maxRedemptions);
      }

      const coupon = await prisma.coupon.update({ where: { id }, data: data as any });
      await writePlatformAudit({
        staffId: req.platformStaff.id,
        action: 'COUPON_PATCH',
        targetType: 'Coupon',
        targetId: id,
        before: existing,
        after: coupon,
        ip: clientIp(req)
      });
      res.json({ coupon });
    } catch (error) {
      console.error('Patch coupon error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ─── Campaigns ──────────────────────────────────────────────────────────────

router.get('/campaigns', authenticatePlatform, async (_req, res) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json({ campaigns });
  } catch (error) {
    console.error('List campaigns error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/campaigns',
  authenticatePlatform,
  requirePlatformRole('BILLING', 'OWNER'),
  async (req: any, res) => {
    try {
      const name = String(req.body?.name || '').trim();
      const segment = String(req.body?.segment || '');
      const offerType = String(req.body?.offerType || 'FEATURE').toUpperCase();
      if (!name) return res.status(400).json({ error: 'name is required' });
      if (!isSegmentId(segment)) return res.status(400).json({ error: 'Invalid segment' });
      if (!['FEATURE', 'COUPON', 'EMAIL_ONLY'].includes(offerType)) {
        return res.status(400).json({ error: 'Invalid offerType' });
      }

      let featureKey = req.body?.featureKey ? String(req.body.featureKey) : null;
      if (offerType === 'FEATURE') {
        if (!featureKey || !isFeatureKey(featureKey)) {
          return res.status(400).json({ error: 'featureKey required for FEATURE offers' });
        }
      } else {
        featureKey = featureKey && isFeatureKey(featureKey) ? featureKey : null;
      }

      const campaign = await prisma.campaign.create({
        data: {
          name,
          segment,
          offerType,
          featureKey,
          featureDays: req.body?.featureDays != null ? Number(req.body.featureDays) : 30,
          couponCode: req.body?.couponCode
            ? String(req.body.couponCode).trim().toUpperCase()
            : null,
          emailSubject: req.body?.emailSubject ? String(req.body.emailSubject) : null,
          emailBody: req.body?.emailBody ? String(req.body.emailBody) : null,
          status: 'DRAFT',
          createdByStaffId: req.platformStaff.id
        }
      });

      await writePlatformAudit({
        staffId: req.platformStaff.id,
        action: 'CAMPAIGN_CREATE',
        targetType: 'Campaign',
        targetId: campaign.id,
        after: campaign,
        ip: clientIp(req)
      });

      res.status(201).json({ campaign });
    } catch (error) {
      console.error('Create campaign error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/campaigns/:id/run',
  authenticatePlatform,
  requirePlatformRole('BILLING', 'OWNER'),
  async (req: any, res) => {
    try {
      const id = String(req.params.id);
      const dryRun = Boolean(req.body?.dryRun);
      const sendEmail = req.body?.sendEmail !== false;

      const campaign = await prisma.campaign.findUnique({ where: { id } });
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
      if (campaign.status === 'CANCELED') {
        return res.status(400).json({ error: 'Campaign is canceled' });
      }
      if (!isSegmentId(campaign.segment)) {
        return res.status(400).json({ error: 'Campaign has invalid segment' });
      }

      const targets = await resolveSegmentTargets(campaign.segment);
      if (dryRun) {
        return res.json({
          dryRun: true,
          targetedCount: targets.length,
          sample: targets.slice(0, 10)
        });
      }

      await prisma.campaign.update({
        where: { id },
        data: { status: 'RUNNING', targetedCount: targets.length, lastRunAt: new Date() }
      });

      let sentCount = 0;
      let grantedCount = 0;
      const days = campaign.featureDays || 30;
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      for (const target of targets) {
        let sendStatus = 'SKIPPED';
        let error: string | null = null;

        try {
          if (
            campaign.offerType === 'FEATURE' &&
            campaign.featureKey &&
            isFeatureKey(campaign.featureKey) &&
            target.workspaceId
          ) {
            await prisma.workspaceFeatureOverride.upsert({
              where: {
                workspaceId_featureKey: {
                  workspaceId: target.workspaceId,
                  featureKey: campaign.featureKey
                }
              },
              create: {
                workspaceId: target.workspaceId,
                featureKey: campaign.featureKey,
                enabled: true,
                reason: `Campaign: ${campaign.name}`,
                expiresAt,
                setByStaffId: req.platformStaff.id
              },
              update: {
                enabled: true,
                reason: `Campaign: ${campaign.name}`,
                expiresAt,
                setByStaffId: req.platformStaff.id
              }
            });
            grantedCount += 1;
          }

          if (sendEmail && campaign.emailSubject && campaign.emailBody) {
            let body = campaign.emailBody
              .replace(/\{\{name\}\}/g, target.name || 'there')
              .replace(/\{\{email\}\}/g, target.email)
              .replace(/\{\{coupon\}\}/g, campaign.couponCode || '');

            if (campaign.offerType === 'COUPON' && campaign.couponCode) {
              body += `\n\nYour code: ${campaign.couponCode}`;
            }

            await sendCampaignEmail({
              to: target.email,
              subject: campaign.emailSubject,
              bodyText: body
            });
            sentCount += 1;
            sendStatus = 'SENT';
          } else if (campaign.offerType === 'FEATURE' && target.workspaceId) {
            sendStatus = 'SKIPPED';
          }
        } catch (e: any) {
          sendStatus = 'FAILED';
          error = e?.message || 'send failed';
        }

        await prisma.campaignSend.create({
          data: {
            campaignId: id,
            email: target.email,
            workspaceId: target.workspaceId || null,
            status: sendStatus,
            error,
            sentAt: sendStatus === 'SENT' ? new Date() : null
          }
        });
      }

      const updated = await prisma.campaign.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          sentCount,
          grantedCount,
          targetedCount: targets.length,
          lastRunAt: new Date()
        }
      });

      await writePlatformAudit({
        staffId: req.platformStaff.id,
        action: 'CAMPAIGN_RUN',
        targetType: 'Campaign',
        targetId: id,
        after: { targetedCount: targets.length, sentCount, grantedCount },
        ip: clientIp(req)
      });

      res.json({ campaign: updated });
    } catch (error) {
      console.error('Run campaign error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ─── Usage ──────────────────────────────────────────────────────────────────

router.get('/usage/overview', authenticatePlatform, async (_req, res) => {
  try {
    const [
      workspaceCount,
      userCount,
      taskCount,
      messageCount,
      projectCount,
      byPlan,
      byStatus
    ] = await Promise.all([
      prisma.workspace.count(),
      prisma.user.count(),
      prisma.task.count(),
      prisma.message.count(),
      prisma.project.count(),
      prisma.workspace.groupBy({ by: ['plan'], _count: { _all: true } }),
      prisma.workspace.groupBy({ by: ['status'], _count: { _all: true } })
    ]);

    res.json({
      totals: {
        workspaces: workspaceCount,
        users: userCount,
        tasks: taskCount,
        messages: messageCount,
        projects: projectCount
      },
      workspacesByPlan: byPlan.map(r => ({ plan: r.plan, count: r._count._all })),
      workspacesByStatus: byStatus.map(r => ({ status: r.status, count: r._count._all }))
    });
  } catch (error) {
    console.error('Usage overview error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/workspaces/:id/usage', authenticatePlatform, async (req, res) => {
  try {
    const workspaceId = String(req.params.id);
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { subscription: true }
    });
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    const planDef = await getPlanDefinition(normalizePlan(workspace.plan) as PlanId);

    const [members, projects, teams, tasks, messages, attachmentAgg] = await Promise.all([
      prisma.workspaceMember.count({ where: { workspaceId, status: 'ACTIVE' } }),
      prisma.project.count({ where: { workspaceId } }),
      prisma.team.count({ where: { workspaceId } }),
      prisma.task.count({ where: { project: { workspaceId } } }),
      prisma.message.count({ where: { workspaceId } }),
      prisma.attachment.aggregate({
        _sum: { size: true },
        where: {
          OR: [
            { task: { project: { workspaceId } } },
            { message: { workspaceId } }
          ]
        }
      })
    ]);

    const storageBytes = attachmentAgg._sum.size || 0;
    const storageMb = Math.round((storageBytes / (1024 * 1024)) * 100) / 100;

    res.json({
      workspaceId,
      plan: workspace.plan,
      usage: {
        seats: members,
        projects,
        departments: teams,
        tasks,
        messages,
        storageMb
      },
      limits: {
        maxSeats: workspace.subscription?.seats ?? planDef.limits.maxSeats,
        maxProjects: planDef.limits.maxProjects,
        maxDepartments: planDef.limits.maxDepartments,
        maxStorageMb: planDef.limits.maxStorageMb
      }
    });
  } catch (error) {
    console.error('Workspace usage error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
