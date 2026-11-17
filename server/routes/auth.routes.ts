import { Router } from 'express';
import { prisma } from '../index';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  addWorkspaceMember,
  getActor,
  getActorForWorkspace,
  isWorkspaceAdmin,
  listUserWorkspaces,
  listWorkspaceActors,
  mapActorForClient,
  normalizeRole,
  setActiveWorkspace,
  setUserDepartment
} from '../membership';
import {
  ensureDepartmentChannel,
  ensureWorkspaceChannel,
  syncWorkspaceChannelMembers
} from '../chat.service';
import {
  generateOtpCode,
  packOtpToken,
  parseOtpPayload,
  sendInvitationEmail,
  sendInviteAcceptOtpEmail,
  sendSignupOtpEmail,
  verifyPackedOtp,
  authDebugFields
} from '../email';
import { rateLimit } from '../rateLimit';
import {
  getGoogleClientId,
  isGoogleAuthConfigured,
  verifyGoogleIdToken
} from '../googleAuth';
import crypto from 'node:crypto';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

/** When true, only the first Super Admin may sign up (single-company demo deploy). */
const singleTenantLock = process.env.SINGLE_TENANT_LOCK === 'true';

const signupLimiter = rateLimit({
  name: 'signup',
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyFrom: (req) => String(req.body?.email || '')
});

const loginLimiter = rateLimit({
  name: 'login',
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyFrom: (req) => String(req.body?.email || '')
});

const otpLimiter = rateLimit({
  name: 'otp',
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFrom: (req) => String(req.body?.email || '')
});

const googleLimiter = rateLimit({
  name: 'google',
  windowMs: 15 * 60 * 1000,
  max: 30
});

const inviteLimiter = rateLimit({
  name: 'invite',
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyFrom: (req) => String(req.body?.email || '')
});

const inviteAcceptLimiter = rateLimit({
  name: 'invite-accept',
  windowMs: 15 * 60 * 1000,
  max: 20
});

const issueSession = async (userId: string) => {
  const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
  const clientUser = await mapUserForClient(userId);
  return { token, clientUser };
};

const createWorkspaceForOwner = async (userId: string, workspaceName: string) => {
  const workspace = await prisma.workspace.create({
    data: {
      name: workspaceName,
      ownerId: userId,
      plan: 'FREE',
      status: 'ACTIVE'
    }
  });
  await addWorkspaceMember(userId, workspace.id, 'SUPER_ADMIN');
  await ensureWorkspaceChannel(workspace.id);
  const { ensureFreeSubscription } = await import('../entitlements');
  await ensureFreeSubscription(workspace.id);
  return workspace;
};
/** Base URL for invite links — browser URL from client, then Origin, then FRONTEND_URL. */
const getFrontendBaseUrl = (
  req: { get: (name: string) => string | undefined; protocol: string; headers: Record<string, unknown> },
  clientUrl?: string
) => {
  const normalize = (url: string) => url.replace(/\/$/, '');
  const isHttpUrl = (url: string) => /^https?:\/\//i.test(url);

  const headerUrl = req.get('x-frontend-url');
  for (const candidate of [clientUrl, headerUrl, req.get('origin')]) {
    if (candidate && isHttpUrl(candidate)) {
      return normalize(candidate);
    }
  }

  const configured = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  if (configured) return configured;

  const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  return `${protocol}://${req.get('host')}`;
};

export const mapUserForClient = async (userId: string) => {
  const actor = await getActor(userId);
  if (!actor) return null;
  const base = mapActorForClient(actor);
  let workspaceName: string | undefined;
  try {
    const ws = await prisma.workspace.findUnique({
      where: { id: actor.workspaceId },
      select: { name: true }
    });
    workspaceName = ws?.name || undefined;
  } catch {
    workspaceName = undefined;
  }
  try {
    const { resolveEntitlements } = await import('../entitlements');
    const entitlements = await resolveEntitlements(actor.workspaceId);
    return {
      ...base,
      workspaceName,
      plan: entitlements?.plan ?? 'FREE',
      workspaceStatus: entitlements?.workspaceStatus ?? 'ACTIVE',
      entitlements: entitlements ?? null
    };
  } catch {
    return { ...base, workspaceName };
  }
};

export const resolveWorkspaceId = async (user: { id?: string; workspaceId?: string } | null) => {
  if (user?.workspaceId) return user.workspaceId;
  if (!user?.id) return null;
  const actor = await getActor(user.id);
  return actor?.workspaceId || null;
};

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const { password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        error: 'Please verify your email before signing in',
        code: 'EMAIL_NOT_VERIFIED',
        email: user.email
      });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    const clientUser = await mapUserForClient(user.id);
    if (!clientUser) {
      return res.status(403).json({ error: 'User has no workspace membership' });
    }

    res.json({ user: clientUser, token });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Public: open signup is the default for multi-tenant SaaS.
router.get('/signup-status', async (_req, res) => {
  try {
    if (singleTenantLock) {
      const existingUsers = await prisma.user.count({ where: { isVerified: true } });
      return res.json({ open: existingUsers === 0, mode: 'single' });
    }
    res.json({ open: true, mode: 'multi' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/signup', signupLimiter, async (req, res) => {
  try {
    const { email, name, password, companyName } = req.body;

    if (singleTenantLock) {
      const existingUsers = await prisma.user.count({ where: { isVerified: true } });
      if (existingUsers > 0) {
        return res.status(403).json({
          error: 'A workspace already exists. Please use an invitation link to join.'
        });
      }
    }

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const displayName = String(name || '').trim();
    const workspaceName = String(companyName || '').trim() || `${displayName || 'My'} Workspace`;

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    if (!displayName) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing?.isVerified) {
      return res.status(400).json({ error: 'Email already exists. Please sign in.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const code = generateOtpCode();
    const verificationToken = await packOtpToken(code, { companyName: workspaceName });

    if (existing && !existing.isVerified) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: displayName,
          passwordHash,
          verificationToken
        }
      });
    } else {
      await prisma.user.create({
        data: {
          email: normalizedEmail,
          name: displayName,
          passwordHash,
          isVerified: false,
          verificationToken
        }
      });
    }

    const mail = await sendSignupOtpEmail(normalizedEmail, code);

    res.status(201).json({
      requiresVerification: true,
      email: normalizedEmail,
      message: 'We sent a verification code to your email.',
      ...authDebugFields(mail, code)
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/verify-signup', otpLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and verification code are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.isVerified) {
      return res.status(400).json({ error: 'Invalid verification request' });
    }

    const { ok, payload } = await verifyPackedOtp(user.verificationToken, code);
    if (!ok) {
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }

    const workspaceName = payload.companyName || `${user.name || 'My'} Workspace`;

    const membership = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
    let workspaceId = membership?.workspaceId;

    if (!workspaceId) {
      const workspace = await prisma.workspace.create({
        data: {
          name: workspaceName,
          ownerId: user.id,
          plan: 'FREE',
          status: 'ACTIVE'
        }
      });
      workspaceId = workspace.id;
      await addWorkspaceMember(user.id, workspace.id, 'SUPER_ADMIN');
      await ensureWorkspaceChannel(workspace.id);
      const { ensureFreeSubscription } = await import('../entitlements');
      await ensureFreeSubscription(workspace.id);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true, verificationToken: null }
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    const clientUser = await mapUserForClient(user.id);
    if (!clientUser) {
      return res.status(500).json({ error: 'Failed to load workspace membership' });
    }

    res.json({ user: clientUser, token });
  } catch (error) {
    console.error('Verify signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/resend-signup-otp', otpLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.isVerified) {
      // Do not leak whether the email exists.
      return res.json({ message: 'If that account needs verification, a new code was sent.' });
    }

    const companyName =
      parseOtpPayload(user.verificationToken).companyName || `${user.name || 'My'} Workspace`;

    const code = generateOtpCode();
    const verificationToken = await packOtpToken(code, { companyName });

    await prisma.user.update({
      where: { id: user.id },
      data: { verificationToken }
    });

    const mail = await sendSignupOtpEmail(email, code);
    res.json({
      message: 'If that account needs verification, a new code was sent.',
      ...authDebugFields(mail, code)
    });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/google-status', (_req, res) => {
  res.json({
    enabled: isGoogleAuthConfigured(),
    clientId: getGoogleClientId()
  });
});

router.post('/google', googleLimiter, async (req, res) => {
  try {
    if (!isGoogleAuthConfigured()) {
      return res.status(503).json({ error: 'Google sign-in is not configured on this server' });
    }

    const idToken = String(req.body?.idToken || '').trim();
    const companyName = String(req.body?.companyName || '').trim();
    const intent = String(req.body?.intent || 'login').toLowerCase() === 'signup' ? 'signup' : 'login';

    if (!idToken) {
      return res.status(400).json({ error: 'Google credential is required' });
    }

    const profile = await verifyGoogleIdToken(idToken);
    if (!profile.emailVerified) {
      return res.status(403).json({ error: 'Google email is not verified' });
    }

    if (singleTenantLock && intent === 'signup') {
      const existingUsers = await prisma.user.count({ where: { isVerified: true } });
      if (existingUsers > 0) {
        return res.status(403).json({
          error: 'A workspace already exists. Please use an invitation link to join.'
        });
      }
    }

    let user =
      (await prisma.user.findUnique({ where: { googleId: profile.googleId } })) ||
      (await prisma.user.findUnique({ where: { email: profile.email } }));

    if (!user) {
      if (intent === 'login') {
        return res.status(404).json({
          error: 'No account found for this Google email. Create a workspace first.',
          code: 'GOOGLE_ACCOUNT_NOT_FOUND'
        });
      }

      const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      user = await prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name,
          passwordHash,
          googleId: profile.googleId,
          profilePic: profile.picture || null,
          isVerified: true,
          verificationToken: null
        }
      });
    } else {
      const updates: {
        googleId?: string;
        isVerified?: boolean;
        verificationToken?: null;
        name?: string;
        profilePic?: string | null;
      } = {};

      if (!user.googleId) updates.googleId = profile.googleId;
      if (!user.isVerified) {
        updates.isVerified = true;
        updates.verificationToken = null;
      }
      if (!user.name && profile.name) updates.name = profile.name;
      if (!user.profilePic && profile.picture) updates.profilePic = profile.picture;

      if (Object.keys(updates).length > 0) {
        user = await prisma.user.update({ where: { id: user.id }, data: updates });
      }
    }

    const membership = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });

    if (!membership) {
      if (intent === 'login' && !companyName) {
        return res.status(404).json({
          error: 'No workspace found. Create a workspace from signup.',
          code: 'GOOGLE_NEEDS_WORKSPACE'
        });
      }

      if (singleTenantLock) {
        const existingUsers = await prisma.user.count({
          where: { isVerified: true, id: { not: user.id } }
        });
        if (existingUsers > 0) {
          return res.status(403).json({
            error: 'A workspace already exists. Please use an invitation link to join.'
          });
        }
      }

      const workspaceName = companyName || `${user.name || 'My'} Workspace`;
      await createWorkspaceForOwner(user.id, workspaceName);
    }

    const { token, clientUser } = await issueSession(user.id);
    if (!clientUser) {
      return res.status(500).json({ error: 'Failed to load workspace membership' });
    }

    res.json({ user: clientUser, token });
  } catch (error: any) {
    console.error('Google auth error:', error);
    res.status(401).json({ error: error?.message || 'Google sign-in failed' });
  }
});
// Middleware for authentication
export const authenticate = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const actor = await getActor(decoded.userId);
    if (!actor) return res.status(401).json({ error: 'User not found' });
    req.user = decoded;
    req.actor = actor;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

router.get('/me', authenticate, async (req: any, res) => {
  try {
    const user = await mapUserForClient(req.user.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fields a user is allowed to change on their own profile.
const PROFILE_FIELDS = ['name', 'position', 'birthday', 'bankAccount', 'dateJoined', 'bio'];

router.patch('/me', authenticate, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const data: any = {};
    for (const field of PROFILE_FIELDS) {
      const value = req.body?.[field];
      if (value === undefined) continue;
      data[field] = value === null || value === '' ? null : String(value);
    }

    if (Object.keys(data).length === 0) {
      return res.json(await mapUserForClient(req.user.userId));
    }

    const updated = await prisma.user.update({ where: { id: user.id }, data });
    const clientUser = await mapUserForClient(updated.id);
    res.json(clientUser);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/users', authenticate, async (req: any, res) => {
  try {
    const actors = await listWorkspaceActors(req.actor.workspaceId);
    res.json(actors.map(mapActorForClient));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

const ROLES = ['SUPER_ADMIN', 'ADMIN', 'MEMBER'];

// Admin: change a user's role and/or department
router.patch('/users/:id', authenticate, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { role, departmentId } = req.body || {};
    const actor = req.actor;

    if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admins can modify users' });
    }

    const workspaceId = actor.workspaceId;
    const target = await getActorForWorkspace(id, workspaceId);
    if (!target) return res.status(404).json({ error: 'User not found' });

    if (role !== undefined) {
      if (!ROLES.includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      if (target.id === actor.id && role !== target.role) {
        return res.status(400).json({ error: 'You cannot change your own role' });
      }

      if (role !== target.role) {
        const ownedWorkspaces = await prisma.workspace.count({ where: { ownerId: target.id } });
        if (ownedWorkspaces > 0) {
          return res.status(403).json({ error: "The workspace owner's role cannot be changed" });
        }
        if (target.role === 'SUPER_ADMIN') {
          const superAdmins = await prisma.workspaceMember.count({
            where: { workspaceId, role: 'SUPER_ADMIN', status: 'ACTIVE' }
          });
          if (superAdmins <= 1) {
            return res
              .status(403)
              .json({ error: 'Cannot change the role of the last Super Admin in the workspace' });
          }
        }
      }
    }

    if (actor.role === 'ADMIN') {
      if (target.role === 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Department admins cannot modify a Super Admin' });
      }
      if (role === 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Department admins cannot grant Super Admin' });
      }
      if (!actor.teamId || target.teamId !== actor.teamId) {
        return res.status(403).json({ error: 'Department admins can only modify users in their own department' });
      }
      if (departmentId !== undefined && (departmentId || null) !== actor.teamId) {
        return res.status(403).json({ error: 'Department admins cannot move users to another department' });
      }
    }

    if (role !== undefined) {
      await prisma.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId, userId: id } },
        data: { role }
      });
    }
    if (departmentId !== undefined) {
      const teamId = departmentId || null;
      if (teamId) {
        const team = await prisma.team.findFirst({ where: { id: teamId, workspaceId } });
        if (!team) {
          return res.status(400).json({ error: 'Invalid department for this workspace' });
        }
      }
      await setUserDepartment(id, workspaceId, teamId);
    }

    const updated = await getActorForWorkspace(id, workspaceId);
    res.json(updated ? mapActorForClient(updated) : null);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: remove a user from the workspace
router.delete('/users/:id', authenticate, async (req: any, res) => {
  try {
    const { id } = req.params;

    const actor = req.actor;
    if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admins can remove users' });
    }

    const workspaceId = actor.workspaceId;
    const target = await getActorForWorkspace(id, workspaceId);
    if (!target) return res.status(404).json({ error: 'User not found' });

    if (target.id === actor.id) {
      return res.status(400).json({ error: 'You cannot remove your own account' });
    }

    // Workspace.ownerId is a required relation, so an owner can never be deleted.
    const ownedWorkspaces = await prisma.workspace.count({ where: { ownerId: target.id } });
    if (ownedWorkspaces > 0) {
      return res.status(403).json({ error: 'The workspace owner cannot be removed' });
    }

    if (actor.role === 'ADMIN') {
      if (target.role !== 'MEMBER') {
        return res.status(403).json({ error: 'Department admins can only remove members' });
      }
      if (!actor.teamId || target.teamId !== actor.teamId) {
        return res.status(403).json({ error: 'Department admins can only remove users in their own department' });
      }
    }

    // Comments, attachments and activity logs point at the user through required
    // relations, so they cannot be detached without destroying history.
    const [commentCount, attachmentCount, activityCount] = await Promise.all([
      prisma.comment.count({ where: { authorId: target.id } }),
      prisma.attachment.count({ where: { uploadedById: target.id } }),
      prisma.activityLog.count({ where: { actorId: target.id } })
    ]);

    const blockers: string[] = [];
    if (commentCount > 0) blockers.push(`${commentCount} comment(s)`);
    if (attachmentCount > 0) blockers.push(`${attachmentCount} attachment(s)`);
    if (activityCount > 0) blockers.push(`${activityCount} activity log entr(ies)`);

    if (blockers.length > 0) {
      return res.status(409).json({
        error: `Cannot remove ${target.email}: ${blockers.join(' and ')} still reference this user. Delete that content first.`
      });
    }

    await prisma.$transaction([
      // Detach what the schema allows to be detached.
      prisma.task.updateMany({ where: { assigneeId: target.id }, data: { assigneeId: null } }),
      prisma.team.updateMany({ where: { leadId: target.id }, data: { leadId: null } }),
      // Invitation.invitedById is required, so hand the history to the acting admin.
      prisma.invitation.updateMany({ where: { invitedById: target.id }, data: { invitedById: actor.id } }),
      // Personal rows with no value once the user is gone.
      prisma.notification.deleteMany({ where: { userId: target.id } }),
      prisma.refreshToken.deleteMany({ where: { userId: target.id } }),
      prisma.user.delete({ where: { id: target.id } })
    ]);

    res.status(204).send();
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send an invitation email (creates an Invitation record in DB)
router.post('/invite', authenticate, inviteLimiter, async (req: any, res) => {
  try {
    const { email, name, role, departmentId, frontendUrl } = req.body;

    if (!email || !name) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const inviter = req.actor;

    if (!(await isWorkspaceAdmin(inviter))) {
      return res.status(403).json({ error: 'Only admins can send invitations' });
    }

    const inviteRole = normalizeRole(role || 'MEMBER');
    if (normalizeRole(inviter.role) === 'ADMIN' && inviteRole === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Department admins cannot invite Super Admins' });
    }

    const workspaceId = inviter.workspaceId;

    const { countBillableSeats, resolveEntitlements } = await import('../entitlements');
    const entitlements = await resolveEntitlements(workspaceId);
    if (entitlements && !entitlements.features.invites) {
      return res.status(403).json({
        error: 'Invites are not available on your plan.',
        code: 'FEATURE_NOT_AVAILABLE'
      });
    }
    if (entitlements) {
      const used = await countBillableSeats(workspaceId);
      if (used >= entitlements.limits.maxSeats) {
        return res.status(403).json({
          error: `Seat limit reached (${entitlements.limits.maxSeats}). Upgrade your plan or remove pending invites.`,
          code: 'SEAT_LIMIT_REACHED'
        });
      }
    }

    let teamId = departmentId || null;
    if (normalizeRole(inviter.role) === 'ADMIN') {
      teamId = inviter.teamId;
      if (!teamId) {
        return res.status(400).json({ error: 'Department admin has no department assigned' });
      }
    } else if (departmentId === '' || departmentId === undefined || departmentId === null) {
      teamId = null;
    }

    // ADMIN is department-scoped; invite must name which department they administer.
    if (inviteRole === 'ADMIN' && !teamId) {
      return res.status(400).json({ error: 'Admin invites require a department' });
    }

    if (teamId) {
      const team = await prisma.team.findFirst({
        where: { id: teamId, workspaceId }
      });
      if (!team) {
        return res.status(400).json({ error: 'Invalid department for this workspace' });
      }
    }

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser?.isVerified) {
      const alreadyMember = await prisma.workspaceMember.findFirst({
        where: {
          workspaceId,
          userId: existingUser.id,
          status: 'ACTIVE'
        }
      });
      if (alreadyMember) {
        return res.status(400).json({ error: 'This person is already a member of this workspace' });
      }
    }

    const existingInvite = await prisma.invitation.findFirst({
      where: {
        email: normalizedEmail,
        workspaceId,
        status: 'pending'
      }
    });
    if (existingInvite) {
      return res.status(400).json({ error: 'A pending invitation already exists for this email' });
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await prisma.invitation.create({
      data: {
        email: normalizedEmail,
        name,
        role: inviteRole,
        status: 'pending',
        workspaceId,
        teamId,
        invitedById: inviter.id,
        expiresAt
      }
    });

    const inviteToken = jwt.sign(
      { invitationId: invitation.id, email: invitation.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true }
    });

    const baseUrl = getFrontendBaseUrl(req, frontendUrl);
    const inviteUrl = `${baseUrl}/#/signup?email=${encodeURIComponent(normalizedEmail)}&token=${inviteToken}`;

    let emailResult: { isSmtpConfigured: boolean; previewUrl: string | null } = {
      isSmtpConfigured: false,
      previewUrl: null
    };

    let emailErrorMessage: string | null = null;
    try {
      emailResult = await sendInvitationEmail(normalizedEmail, inviteUrl, {
        workspaceName: workspace?.name
      });
    } catch (emailError) {
      console.error('Email send failed (invite still created):', emailError);
      emailErrorMessage =
        emailError instanceof Error ? emailError.message : 'Email delivery failed';
    }

    const existingAccount = Boolean(existingUser?.isVerified);
    res.json({
      message: emailErrorMessage
        ? 'Invitation created, but email delivery failed. You can resend or copy the link — the invitee must still verify their email with an OTP before joining.'
        : emailResult.isSmtpConfigured
          ? existingAccount
            ? 'Invitation email sent. They will confirm with an inbox code (existing password is kept).'
            : 'Invitation email sent. The invitee sets a password and confirms with an inbox code.'
          : 'Invitation created successfully',
      emailDelivered: Boolean(emailResult.isSmtpConfigured && !emailErrorMessage),
      emailError: emailErrorMessage,
      previewUrl: emailResult.previewUrl,
      existingAccount,
      inviteUrl,
      invitationId: invitation.id
    });
  } catch (error) {
    console.error('Invite handler error:', error);
    res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

// Admin: regenerate a copyable invite link for a pending invitation
router.post('/invitations/:id/link', authenticate, async (req: any, res) => {
  try {
    const { id } = req.params;
    const actor = req.actor;
    if (!(await isWorkspaceAdmin(actor))) {
      return res.status(403).json({ error: 'Only admins can copy invitation links' });
    }

    const invitation = await prisma.invitation.findUnique({ where: { id } });
    if (!invitation) return res.status(404).json({ error: 'Invitation not found' });
    if (invitation.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending invitations have a link' });
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'expired' }
      });
      return res.status(400).json({ error: 'Invitation expired' });
    }

    const workspaceId = actor.workspaceId;
    if (invitation.workspaceId !== workspaceId) {
      return res.status(403).json({ error: 'Not allowed to access this invitation' });
    }
    if (actor.role === 'ADMIN' && invitation.teamId !== actor.teamId) {
      return res.status(403).json({ error: 'Not allowed to access this invitation' });
    }

    const { frontendUrl } = req.body || {};

    const remainingMs = invitation.expiresAt.getTime() - Date.now();
    const expiresInSeconds = Math.max(60, Math.floor(remainingMs / 1000));

    const inviteToken = jwt.sign(
      { invitationId: invitation.id, email: invitation.email },
      JWT_SECRET,
      { expiresIn: expiresInSeconds }
    );

    const baseUrl = getFrontendBaseUrl(req, frontendUrl);
    const inviteUrl = `${baseUrl}/#/signup?email=${encodeURIComponent(invitation.email)}&token=${inviteToken}`;

    res.json({ inviteUrl, invitationId: invitation.id });
  } catch (error) {
    console.error('Invitation link error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: list invitations for the inviter's workspace (pending + accepted + declined)
router.get('/invitations/pending', authenticate, async (req: any, res) => {
  try {
    const inviter = req.actor;
    const workspaceId = inviter.workspaceId;

    const where: any = { workspaceId };

    // Department admins only see invites for their department.
    if (inviter.role === 'ADMIN' && inviter.teamId) {
      where.teamId = inviter.teamId;
    }

    const invitations = await prisma.invitation.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    res.json(
      invitations.map(inv => ({
        id: inv.id,
        email: inv.email,
        name: inv.name || '',
        role: inv.role,
        departmentId: inv.teamId || undefined,
        status: inv.status,
        invitedBy: inv.invitedById,
        createdAt: inv.createdAt.toISOString()
      }))
    );
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Invitee: preview invitation (no email sent)
router.post('/invitations/preview', inviteAcceptLimiter, async (req: any, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Missing token' });

    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired invitation token' });
    }

    const invitationId: string | undefined = decoded?.invitationId;
    if (!invitationId) return res.status(400).json({ error: 'Invalid token' });

    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId },
      include: { workspace: { select: { name: true } } }
    });
    if (!invitation) return res.status(400).json({ error: 'Invitation not found' });
    if (invitation.status !== 'pending') {
      return res.status(400).json({ error: `Invitation is ${invitation.status}` });
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'expired' }
      });
      return res.status(400).json({ error: 'Invitation expired' });
    }

    const existing = await prisma.user.findUnique({
      where: { email: invitation.email },
      select: { id: true, isVerified: true }
    });
    const existingUser = Boolean(existing?.isVerified);

    if (existingUser && existing) {
      const alreadyMember = await prisma.workspaceMember.findFirst({
        where: {
          workspaceId: invitation.workspaceId,
          userId: existing.id,
          status: 'ACTIVE'
        }
      });
      if (alreadyMember) {
        return res.status(400).json({ error: 'You are already a member of this workspace. Sign in instead.' });
      }
    }

    res.json({
      email: invitation.email,
      name: invitation.name,
      role: invitation.role,
      workspaceName: invitation.workspace.name,
      existingUser,
      requiresPassword: !existingUser
    });
  } catch (error) {
    console.error('Invite preview error:', error);
    res.status(500).json({ error: 'Could not load invitation' });
  }
});

// Invitee: request OTP to the invitation email (proves mailbox ownership)
router.post('/invitations/accept/start', inviteAcceptLimiter, async (req: any, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Missing token' });

    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired invitation token' });
    }

    const invitationId: string | undefined = decoded?.invitationId;
    if (!invitationId) return res.status(400).json({ error: 'Invalid token' });

    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId },
      include: { workspace: { select: { name: true } } }
    });
    if (!invitation) return res.status(400).json({ error: 'Invitation not found' });
    if (invitation.status !== 'pending') {
      return res.status(400).json({ error: `Invitation is ${invitation.status}` });
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'expired' }
      });
      return res.status(400).json({ error: 'Invitation expired' });
    }

    const existing = await prisma.user.findUnique({
      where: { email: invitation.email },
      select: { id: true, isVerified: true }
    });
    const existingUser = Boolean(existing?.isVerified);

    const code = generateOtpCode();
    const packed = await packOtpToken(code, { companyName: invitation.name || undefined });
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { acceptOtpToken: packed }
    });

    const mail = await sendInviteAcceptOtpEmail(invitation.email, code);
    res.json({
      requiresVerification: true,
      email: invitation.email,
      workspaceName: invitation.workspace.name,
      existingUser,
      requiresPassword: !existingUser,
      message: 'We sent a confirmation code to the invited email address.',
      ...authDebugFields(mail, code)
    });
  } catch (error) {
    console.error('Invite accept start error:', error);
    res.status(500).json({ error: 'Could not send confirmation code. Try again shortly.' });
  }
});

// Invitee: accept invitation using token + OTP (+ password only for brand-new accounts)
router.post('/invitations/accept', inviteAcceptLimiter, async (req: any, res) => {
  try {
    const { token, password, name, code } = req.body;
    if (!token) return res.status(400).json({ error: 'Missing token' });
    if (!code || String(code).trim().length < 4) {
      return res.status(400).json({
        error: 'Email confirmation code is required',
        code: 'INVITE_OTP_REQUIRED'
      });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired invitation token' });
    }

    const invitationId: string | undefined = decoded?.invitationId;
    if (!invitationId) return res.status(400).json({ error: 'Invalid token' });

    const invitation = await prisma.invitation.findUnique({ where: { id: invitationId } });
    if (!invitation) return res.status(400).json({ error: 'Invitation not found' });
    if (invitation.status !== 'pending') return res.status(400).json({ error: `Invitation is ${invitation.status}` });
    if (invitation.expiresAt.getTime() < Date.now()) {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'expired' }
      });
      return res.status(400).json({ error: 'Invitation expired' });
    }

    if (!invitation.acceptOtpToken) {
      return res.status(400).json({
        error: 'Request a confirmation code first',
        code: 'INVITE_OTP_REQUIRED'
      });
    }

    const otpCheck = await verifyPackedOtp(invitation.acceptOtpToken, String(code));
    if (!otpCheck.ok) {
      return res.status(400).json({ error: 'Invalid or expired confirmation code' });
    }

    let user = await prisma.user.findUnique({ where: { email: invitation.email } });
    const existingVerified = Boolean(user?.isVerified);

    if (existingVerified && user) {
      const alreadyMember = await prisma.workspaceMember.findFirst({
        where: {
          workspaceId: invitation.workspaceId,
          userId: user.id,
          status: 'ACTIVE'
        }
      });
      if (alreadyMember) {
        return res.status(400).json({ error: 'You are already a member of this workspace. Sign in instead.' });
      }
      // Keep existing password — never overwrite from invite accept.
    } else {
      if (!password || String(password).length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const finalName = name || invitation.name || invitation.email.split('@')[0];

      if (!user) {
        user = await prisma.user.create({
          data: {
            email: invitation.email,
            name: finalName,
            passwordHash,
            isVerified: true
          }
        });
      } else {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            name: finalName,
            passwordHash,
            isVerified: true
          }
        });
      }
    }

    await addWorkspaceMember(user!.id, invitation.workspaceId, invitation.role);
    if (invitation.teamId) {
      await setUserDepartment(user!.id, invitation.workspaceId, invitation.teamId);
    }

    await syncWorkspaceChannelMembers(invitation.workspaceId);
    if (invitation.teamId) {
      await ensureDepartmentChannel(invitation.teamId);
    }

    await prisma.invitation.update({
      where: { id: invitation.id },
      data: {
        status: 'accepted',
        acceptedAt: new Date(),
        acceptOtpToken: null
      }
    });

    // Land the user in the workspace they just joined.
    await setActiveWorkspace(user!.id, invitation.workspaceId);

    const sessionToken = jwt.sign({ userId: user!.id }, JWT_SECRET, { expiresIn: '7d' });
    const clientUser = await mapUserForClient(user!.id);
    res.status(201).json({ user: clientUser, token: sessionToken });
  } catch (error) {
    console.error('Accept invitation error:', error);
    res.status(401).json({ error: 'Invalid or expired invitation token' });
  }
});

// List workspaces the signed-in user belongs to
router.get('/workspaces', authenticate, async (req: any, res) => {
  try {
    const workspaces = await listUserWorkspaces(req.user.userId);
    res.json(workspaces);
  } catch (error) {
    console.error('List workspaces error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Switch active workspace (same login session / password)
router.post('/switch-workspace', authenticate, async (req: any, res) => {
  try {
    const workspaceId = String(req.body?.workspaceId || '').trim();
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });

    const actor = await setActiveWorkspace(req.user.userId, workspaceId);
    if (!actor) {
      return res.status(403).json({ error: 'Not a member of that workspace' });
    }

    const clientUser = await mapUserForClient(req.user.userId);
    res.json({ user: clientUser });
  } catch (error) {
    console.error('Switch workspace error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create another company workspace while already signed in
router.post('/workspaces', authenticate, async (req: any, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Workspace name is required' });

    const workspace = await createWorkspaceForOwner(req.user.userId, name);
    await setActiveWorkspace(req.user.userId, workspace.id);
    const clientUser = await mapUserForClient(req.user.userId);
    res.status(201).json({ user: clientUser, workspace: { id: workspace.id, name: workspace.name } });
  } catch (error) {
    console.error('Create workspace error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: decline/revoke an invitation
router.post('/invitations/:id/decline', authenticate, async (req: any, res) => {
  try {
    const { id } = req.params;
    const inviter = req.actor;

    const invitation = await prisma.invitation.findUnique({ where: { id } });
    if (!invitation) return res.status(404).json({ error: 'Invitation not found' });
    if (invitation.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending invitations can be revoked' });
    }

    const workspaceId = inviter.workspaceId;
    if (invitation.workspaceId !== workspaceId) {
      return res.status(403).json({ error: 'Not allowed to revoke this invitation' });
    }

    if (inviter.role === 'ADMIN' && invitation.teamId !== inviter.teamId) {
      return res.status(403).json({ error: 'Not allowed to revoke this invitation' });
    }

    await prisma.invitation.update({
      where: { id },
      data: { status: 'declined' }
    });
    res.json({ message: 'Invitation revoked' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
