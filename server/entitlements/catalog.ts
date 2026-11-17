/** Plan defaults + workspace entitlement resolution (product + platform APIs). */

export const FEATURE_KEYS = [
  'projects',
  'departments',
  'chat',
  'payroll',
  'time_tracking',
  'invites',
  'priority_support',
  'advanced_analytics'
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type PlanId = 'FREE' | 'STARTER' | 'BUSINESS';

export type FeatureMap = Record<FeatureKey, boolean>;

export type EntitlementLimits = {
  maxSeats: number;
  maxProjects: number;
  maxDepartments: number;
  maxStorageMb: number;
};

export type EffectiveEntitlements = {
  plan: PlanId;
  workspaceStatus: string;
  features: FeatureMap;
  limits: EntitlementLimits;
  renewBlocked: boolean;
  subscriptionStatus: string | null;
  seats: number;
  overrides: Array<{
    featureKey: string;
    enabled: boolean;
    reason: string | null;
    expiresAt: string | null;
  }>;
  /** Features forced off by platform global kill-switches. */
  globalDisabled: FeatureKey[];
};

type PlanDefinition = {
  features: FeatureMap;
  limits: EntitlementLimits;
};

const allOn = (except: Partial<FeatureMap> = {}): FeatureMap => ({
  projects: true,
  departments: true,
  chat: true,
  payroll: true,
  time_tracking: true,
  invites: true,
  priority_support: true,
  advanced_analytics: true,
  ...except
});

/** Tunable catalog — platform admin Phase 3 may move this to DB. */
export const PLAN_DEFINITIONS: Record<PlanId, PlanDefinition> = {
  FREE: {
    features: allOn({
      chat: false,
      payroll: false,
      time_tracking: false,
      priority_support: false,
      advanced_analytics: false
    }),
    limits: { maxSeats: 5, maxProjects: 10, maxDepartments: 5, maxStorageMb: 512 }
  },
  STARTER: {
    features: allOn({
      payroll: false,
      priority_support: false,
      advanced_analytics: false
    }),
    limits: { maxSeats: 25, maxProjects: 50, maxDepartments: 20, maxStorageMb: 5120 }
  },
  BUSINESS: {
    features: allOn(),
    limits: { maxSeats: 100, maxProjects: 500, maxDepartments: 100, maxStorageMb: 51200 }
  }
};

export const normalizePlan = (plan: string | null | undefined): PlanId => {
  const p = String(plan || 'FREE').trim().toUpperCase();
  if (p === 'STARTER' || p === 'BUSINESS') return p;
  return 'FREE';
};

export const isFeatureKey = (key: string): key is FeatureKey =>
  (FEATURE_KEYS as readonly string[]).includes(key);

type OverrideRow = {
  featureKey: string;
  enabled: boolean;
  reason: string | null;
  expiresAt: Date | null;
};

type ResolveInput = {
  plan: string;
  status: string;
  overrides?: OverrideRow[];
  subscription?: {
    status: string;
    seats: number;
    renewBlocked: boolean;
    plan?: string | null;
  } | null;
  /** When set (from PlanCatalogEntry), replaces code defaults for this plan. */
  planDefinition?: PlanDefinition;
  /** Feature keys globally killed (platform kill-switch). Applied last. */
  globalDisabledKeys?: string[];
};

export function resolveEntitlementsFromRows(input: ResolveInput): EffectiveEntitlements {
  const plan = normalizePlan(input.subscription?.plan || input.plan);
  const base = input.planDefinition || PLAN_DEFINITIONS[plan];
  const features: FeatureMap = { ...base.features };
  const now = Date.now();

  const activeOverrides: EffectiveEntitlements['overrides'] = [];
  for (const row of input.overrides || []) {
    if (row.expiresAt && row.expiresAt.getTime() < now) continue;
    if (!isFeatureKey(row.featureKey)) continue;
    features[row.featureKey] = row.enabled;
    activeOverrides.push({
      featureKey: row.featureKey,
      enabled: row.enabled,
      reason: row.reason,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null
    });
  }

  const globalDisabled: FeatureKey[] = [];
  for (const key of input.globalDisabledKeys || []) {
    if (!isFeatureKey(key)) continue;
    features[key] = false;
    globalDisabled.push(key);
  }

  const seats = input.subscription?.seats ?? base.limits.maxSeats;

  return {
    plan,
    workspaceStatus: input.status || 'ACTIVE',
    features,
    limits: {
      ...base.limits,
      maxSeats: seats
    },
    renewBlocked: Boolean(input.subscription?.renewBlocked),
    subscriptionStatus: input.subscription?.status ?? null,
    seats,
    overrides: activeOverrides,
    globalDisabled
  };
}

export function hasFeature(entitlements: EffectiveEntitlements, key: FeatureKey): boolean {
  return Boolean(entitlements.features[key]);
}

export function isWorkspaceAccessible(status: string): boolean {
  const s = String(status || 'ACTIVE').toUpperCase();
  return s === 'ACTIVE' || s === 'PENDING';
}
