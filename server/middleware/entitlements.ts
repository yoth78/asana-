import type { RequestHandler } from 'express';
import {
  assertFeature,
  isWorkspaceAccessible,
  resolveEntitlements,
  type FeatureKey
} from '../entitlements';

/** Block product API use when workspace is SUSPENDED (and similar). */
export const requireActiveWorkspace: RequestHandler = async (req: any, res, next) => {
  try {
    const workspaceId = req.actor?.workspaceId;
    if (!workspaceId) return res.status(401).json({ error: 'Unauthorized' });

    const entitlements = await resolveEntitlements(workspaceId);
    if (!entitlements) return res.status(404).json({ error: 'Workspace not found' });

    if (!isWorkspaceAccessible(entitlements.workspaceStatus)) {
      return res.status(403).json({
        error: 'This workspace is suspended. Contact support.',
        code: 'WORKSPACE_SUSPENDED'
      });
    }

    req.entitlements = entitlements;
    next();
  } catch (error) {
    console.error('requireActiveWorkspace error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const requireFeature = (feature: FeatureKey): RequestHandler => {
  return async (req: any, res, next) => {
    try {
      const workspaceId = req.actor?.workspaceId;
      if (!workspaceId) return res.status(401).json({ error: 'Unauthorized' });

      const result = await assertFeature(workspaceId, feature);
      if (!result.ok) {
        return res.status(403).json({ error: result.message, code: result.code });
      }
      req.entitlements = result.entitlements;
      next();
    } catch (error) {
      console.error('requireFeature error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};
