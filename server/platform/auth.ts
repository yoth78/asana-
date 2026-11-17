import jwt from 'jsonwebtoken';
import { prisma } from '../index';

const PLATFORM_JWT_SECRET =
  process.env.PLATFORM_JWT_SECRET ||
  (process.env.JWT_SECRET ? `${process.env.JWT_SECRET}:platform` : 'platform-dev-secret-change-me');

const ACCESS_TTL = '8h';
const MFA_PENDING_TTL = '10m';

export type PlatformStaff = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  mfaEnabled: boolean;
};

export const getPlatformJwtSecret = () => PLATFORM_JWT_SECRET;

export function signPlatformAccessToken(staff: { id: string; role: string }) {
  return jwt.sign(
    { typ: 'platform_access', staffId: staff.id, role: staff.role },
    PLATFORM_JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

export function signPlatformMfaToken(staffId: string) {
  return jwt.sign({ typ: 'platform_mfa', staffId }, PLATFORM_JWT_SECRET, {
    expiresIn: MFA_PENDING_TTL
  });
}

export async function writePlatformAudit(opts: {
  staffId?: string | null;
  action: string;
  workspaceId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}) {
  await prisma.platformAuditLog.create({
    data: {
      staffId: opts.staffId || null,
      action: opts.action,
      workspaceId: opts.workspaceId || null,
      targetType: opts.targetType || null,
      targetId: opts.targetId || null,
      beforeJson: opts.before != null ? JSON.stringify(opts.before) : null,
      afterJson: opts.after != null ? JSON.stringify(opts.after) : null,
      ip: opts.ip || null
    }
  });
}

export const authenticatePlatform = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded: any = jwt.verify(token, PLATFORM_JWT_SECRET);
    if (decoded.typ !== 'platform_access' || !decoded.staffId) {
      return res.status(401).json({ error: 'Invalid platform token' });
    }

    const staff = await prisma.platformUser.findUnique({ where: { id: decoded.staffId } });
    if (!staff || staff.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'Staff account inactive' });
    }

    req.platformStaff = {
      id: staff.id,
      email: staff.email,
      name: staff.name,
      role: staff.role,
      mfaEnabled: staff.mfaEnabled
    } satisfies PlatformStaff;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

/** SUPPORT can read; BILLING/OWNER can mutate; OWNER-only for dangerous ops. */
export const requirePlatformRole = (...roles: string[]) => {
  return (req: any, res: any, next: any) => {
    const role = req.platformStaff?.role;
    if (!role || !roles.includes(role)) {
      return res.status(403).json({ error: 'Insufficient platform permissions' });
    }
    next();
  };
};

export const clientIp = (req: any) =>
  (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || null;
