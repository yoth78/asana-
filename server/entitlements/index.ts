import { prisma } from '../index';
import {
  type EffectiveEntitlements,
  type FeatureKey,
  type FeatureMap,
  type EntitlementLimits,
  type PlanId,
  FEATURE_KEYS,
  PLAN_DEFINITIONS,
  hasFeature,
  isFeatureKey,
  isWorkspaceAccessible,
  normalizePlan,
  resolveEntitlementsFromRows
} from './catalog';

export {
  FEATURE_KEYS,
  PLAN_DEFINITIONS,
  type EffectiveEntitlements,
  type FeatureKey,
  type PlanId,
  hasFeature,
  isFeatureKey,
  isWorkspaceAccessible,
  normalizePlan,
  resolveEntitlementsFromRows
} from './catalog';

function parsePlanDefinition(featuresJson: string, limitsJson: string) {
  const features = JSON.parse(featuresJson) as FeatureMap;
  const limits = JSON.parse(limitsJson) as EntitlementLimits;
  for (const key of FEATURE_KEYS) {
    if (typeof features[key] !== 'boolean') features[key] = PLAN_DEFINITIONS.FREE.features[key];
  }
  return { features, limits };
}

/** Seed DB catalog from code defaults if empty. */
export async function ensurePlanCatalogSeeded() {
  const count = await prisma.planCatalogEntry.count();
  if (count > 0) return;
  for (const planId of Object.keys(PLAN_DEFINITIONS) as PlanId[]) {
    const def = PLAN_DEFINITIONS[planId];
    await prisma.planCatalogEntry.create({
      data: {
        planId,
        featuresJson: JSON.stringify(def.features),
        limitsJson: JSON.stringify(def.limits)
      }
    });
  }
}

export async function getPlanDefinition(planId: PlanId) {
  await ensurePlanCatalogSeeded();
  const row = await prisma.planCatalogEntry.findUnique({ where: { planId } });
  if (!row) return PLAN_DEFINITIONS[planId];
  try {
    return parsePlanDefinition(row.featuresJson, row.limitsJson);
  } catch {
    return PLAN_DEFINITIONS[planId];
  }
}

export async function listPlanCatalog() {
  await ensurePlanCatalogSeeded();
  const rows = await prisma.planCatalogEntry.findMany({ orderBy: { planId: 'asc' } });
  return rows.map(row => {
    let features = PLAN_DEFINITIONS[normalizePlan(row.planId)].features;
    let limits = PLAN_DEFINITIONS[normalizePlan(row.planId)].limits;
    try {
      const parsed = parsePlanDefinition(row.featuresJson, row.limitsJson);
      features = parsed.features;
      limits = parsed.limits;
    } catch {
      /* keep defaults */
    }
    return {
      planId: row.planId,
      features,
      limits,
      updatedAt: row.updatedAt
    };
  });
}

/** Feature keys currently under a global kill-switch. */
export async function getGlobalDisabledFeatureKeys(): Promise<string[]> {
  try {
    const rows = await prisma.globalFeatureFlag.findMany({
      where: { disabled: true },
      select: { featureKey: true }
    });
    return rows.map(r => r.featureKey);
  } catch {
    return [];
  }
}

export async function resolveEntitlements(workspaceId: string): Promise<EffectiveEntitlements | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      subscription: true,
      featureOverrides: true
    }
  });
  if (!workspace) return null;

  const plan = normalizePlan(workspace.subscription?.plan || workspace.plan);
  const [planDefinition, globalDisabledKeys] = await Promise.all([
    getPlanDefinition(plan),
    getGlobalDisabledFeatureKeys()
  ]);

  return resolveEntitlementsFromRows({
    plan: workspace.plan,
    status: workspace.status,
    overrides: workspace.featureOverrides,
    planDefinition,
    globalDisabledKeys,
    subscription: workspace.subscription
      ? {
          status: workspace.subscription.status,
          seats: workspace.subscription.seats,
          renewBlocked: workspace.subscription.renewBlocked,
          plan: workspace.subscription.plan
        }
      : null
  });
}

export async function assertFeature(
  workspaceId: string,
  feature: FeatureKey
): Promise<{ ok: true; entitlements: EffectiveEntitlements } | { ok: false; code: string; message: string }> {
  const entitlements = await resolveEntitlements(workspaceId);
  if (!entitlements) {
    return { ok: false, code: 'WORKSPACE_NOT_FOUND', message: 'Workspace not found' };
  }
  if (!isWorkspaceAccessible(entitlements.workspaceStatus)) {
    return {
      ok: false,
      code: 'WORKSPACE_SUSPENDED',
      message: 'This workspace is suspended. Contact support.'
    };
  }
  if (!hasFeature(entitlements, feature)) {
    return {
      ok: false,
      code: 'FEATURE_NOT_AVAILABLE',
      message: `Your plan does not include ${feature.replace(/_/g, ' ')}.`
    };
  }
  return { ok: true, entitlements };
}

/** Ensure a Subscription row exists for new workspaces (FREE defaults). */
export async function ensureFreeSubscription(workspaceId: string, seats = 5) {
  const existing = await prisma.subscription.findUnique({ where: { workspaceId } });
  if (existing) return existing;
  const free = await getPlanDefinition('FREE');
  return prisma.subscription.create({
    data: {
      workspaceId,
      plan: 'FREE',
      status: 'INACTIVE',
      seats: free.limits.maxSeats || seats,
      provider: 'NONE'
    }
  });
}

export async function countBillableSeats(workspaceId: string): Promise<number> {
  const [members, pendingInvites] = await Promise.all([
    prisma.workspaceMember.count({
      where: { workspaceId, status: 'ACTIVE' }
    }),
    prisma.invitation.count({
      where: { workspaceId, status: 'pending' }
    })
  ]);
  return members + pendingInvites;
}
