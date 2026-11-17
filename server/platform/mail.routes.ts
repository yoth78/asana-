import { Router } from 'express';
import { prisma } from '../index';
import { sendCampaignEmail, getDefaultFrom, getAllowedFromDomains, resolveOutboundFrom } from '../email';
import {
  authenticatePlatform,
  clientIp,
  requirePlatformRole,
  writePlatformAudit
} from './auth';
import { isSegmentId, resolveSegmentTargets } from './segments';

const router = Router();

const MAX_RECIPIENTS = 100;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const BUILTIN_TEMPLATES = [
  {
    id: 'builtin-welcome',
    name: 'Welcome / onboarding nudge',
    subject: 'Welcome to TeamFlow',
    body: 'Hi {{name}},\n\nThanks for trying TeamFlow. Create a department and invite your teammates to get started.\n\n— TeamFlow',
    builtin: true
  },
  {
    id: 'builtin-promo',
    name: 'Feature promo',
    subject: 'A quick note from TeamFlow',
    body: 'Hi {{name}},\n\nWe enabled a short promo on your workspace. Reply to this email if you need help.\n\n— TeamFlow',
    builtin: true
  },
  {
    id: 'builtin-support',
    name: 'Support follow-up',
    subject: 'Following up on your TeamFlow workspace',
    body: 'Hi {{name}},\n\nJust checking in — is everything working as expected? Tell us what you need and we will help.\n\n— TeamFlow Support',
    builtin: true
  }
] as const;

function normalizeEmail(raw: string) {
  return String(raw || '').trim().toLowerCase();
}

function parseManualEmails(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map(v => normalizeEmail(String(v))).filter(Boolean);
  }
  return String(raw || '')
    .split(/[\s,;]+/)
    .map(normalizeEmail)
    .filter(Boolean);
}

function applyVars(text: string, name: string | null | undefined, email: string) {
  return text
    .replace(/\{\{name\}\}/g, name || 'there')
    .replace(/\{\{email\}\}/g, email);
}

async function ensureDefaultTemplates(staffId?: string) {
  const count = await prisma.emailTemplate.count();
  if (count > 0) return;
  for (const t of BUILTIN_TEMPLATES) {
    await prisma.emailTemplate.create({
      data: {
        name: t.name,
        subject: t.subject,
        body: t.body,
        createdByStaffId: staffId || null
      }
    });
  }
}

router.get('/mail/meta', authenticatePlatform, (_req, res) => {
  res.json({
    defaultFrom: getDefaultFrom(),
    allowedDomains: getAllowedFromDomains(),
    maxRecipients: MAX_RECIPIENTS,
    placeholders: ['{{name}}', '{{email}}']
  });
});

router.get('/mail/templates', authenticatePlatform, async (_req, res) => {
  try {
    await ensureDefaultTemplates();
    const templates = await prisma.emailTemplate.findMany({
      orderBy: { createdAt: 'asc' }
    });
    res.json({ templates, builtins: BUILTIN_TEMPLATES });
  } catch (error) {
    console.error('List mail templates error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/mail/templates',
  authenticatePlatform,
  requirePlatformRole('OWNER', 'BILLING', 'SUPPORT'),
  async (req: any, res) => {
    try {
      const name = String(req.body?.name || '').trim();
      const subject = String(req.body?.subject || '').trim();
      const body = String(req.body?.body || '').trim();
      if (!name || !subject || !body) {
        return res.status(400).json({ error: 'name, subject, and body are required' });
      }
      const template = await prisma.emailTemplate.create({
        data: {
          name,
          subject,
          body,
          createdByStaffId: req.platformStaff.id
        }
      });
      await writePlatformAudit({
        staffId: req.platformStaff.id,
        action: 'EMAIL_TEMPLATE_CREATE',
        targetType: 'EmailTemplate',
        targetId: template.id,
        after: { name, subject },
        ip: clientIp(req)
      });
      res.status(201).json({ template });
    } catch (error) {
      console.error('Create mail template error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.put(
  '/mail/templates/:id',
  authenticatePlatform,
  requirePlatformRole('OWNER', 'BILLING', 'SUPPORT'),
  async (req: any, res) => {
    try {
      const id = String(req.params.id);
      const existing = await prisma.emailTemplate.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Template not found' });

      const name = String(req.body?.name ?? existing.name).trim();
      const subject = String(req.body?.subject ?? existing.subject).trim();
      const body = String(req.body?.body ?? existing.body).trim();
      if (!name || !subject || !body) {
        return res.status(400).json({ error: 'name, subject, and body are required' });
      }

      const template = await prisma.emailTemplate.update({
        where: { id },
        data: { name, subject, body }
      });
      await writePlatformAudit({
        staffId: req.platformStaff.id,
        action: 'EMAIL_TEMPLATE_UPDATE',
        targetType: 'EmailTemplate',
        targetId: id,
        before: { name: existing.name, subject: existing.subject },
        after: { name, subject },
        ip: clientIp(req)
      });
      res.json({ template });
    } catch (error) {
      console.error('Update mail template error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.delete(
  '/mail/templates/:id',
  authenticatePlatform,
  requirePlatformRole('OWNER', 'BILLING'),
  async (req: any, res) => {
    try {
      const id = String(req.params.id);
      const existing = await prisma.emailTemplate.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Template not found' });
      await prisma.emailTemplate.delete({ where: { id } });
      await writePlatformAudit({
        staffId: req.platformStaff.id,
        action: 'EMAIL_TEMPLATE_DELETE',
        targetType: 'EmailTemplate',
        targetId: id,
        before: { name: existing.name },
        ip: clientIp(req)
      });
      res.json({ ok: true });
    } catch (error) {
      console.error('Delete mail template error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/** Search users + newsletter subscribers for the picker. */
router.get('/mail/recipients', authenticatePlatform, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const take = Math.min(Number(req.query.limit) || 25, 50);

    if (q.length < 2) {
      return res.json({ recipients: [] });
    }

    const [users, newsletter] = await Promise.all([
      prisma.user.findMany({
        where: {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } }
          ]
        },
        select: { email: true, name: true },
        take,
        orderBy: { email: 'asc' }
      }),
      prisma.newsletterSubscriber.findMany({
        where: {
          status: 'ACTIVE',
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } }
          ]
        },
        select: { email: true, name: true },
        take,
        orderBy: { email: 'asc' }
      })
    ]);

    const map = new Map<string, { email: string; name: string | null; source: string }>();
    for (const u of users) {
      map.set(u.email.toLowerCase(), { email: u.email, name: u.name, source: 'user' });
    }
    for (const n of newsletter) {
      const key = n.email.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { email: n.email, name: n.name, source: 'newsletter' });
      }
    }

    res.json({ recipients: Array.from(map.values()).slice(0, take) });
  } catch (error) {
    console.error('Mail recipients search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/mail/history', authenticatePlatform, async (req, res) => {
  try {
    const take = Math.min(Number(req.query.limit) || 20, 50);
    const rows = await prisma.outboundEmail.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        recipients: {
          select: { email: true, status: true, error: true },
          take: 10
        }
      }
    });
    res.json({ emails: rows });
  } catch (error) {
    console.error('Mail history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/mail/send',
  authenticatePlatform,
  requirePlatformRole('OWNER', 'BILLING', 'SUPPORT'),
  async (req: any, res) => {
    try {
      const subject = String(req.body?.subject || '').trim();
      const body = String(req.body?.body || '').trim();
      const templateId = req.body?.templateId ? String(req.body.templateId) : null;
      const dryRun = Boolean(req.body?.dryRun);

      if (!subject || !body) {
        return res.status(400).json({ error: 'subject and body are required' });
      }

      let from: string | null = null;
      try {
        from = resolveOutboundFrom(req.body?.from);
      } catch (e: any) {
        return res.status(400).json({ error: e?.message || 'Invalid From address' });
      }
      const effectiveFrom = from || getDefaultFrom();

      type Recip = { email: string; name: string | null };
      const byEmail = new Map<string, Recip>();

      for (const email of parseManualEmails(req.body?.to || req.body?.emails)) {
        if (!EMAIL_RE.test(email)) continue;
        byEmail.set(email, { email, name: null });
      }

      const named = Array.isArray(req.body?.recipients) ? req.body.recipients : [];
      for (const row of named) {
        const email = normalizeEmail(row?.email);
        if (!email || !EMAIL_RE.test(email)) continue;
        byEmail.set(email, {
          email,
          name: row?.name ? String(row.name) : byEmail.get(email)?.name || null
        });
      }

      const segment = req.body?.segment ? String(req.body.segment) : '';
      if (segment) {
        if (!isSegmentId(segment)) {
          return res.status(400).json({ error: 'Invalid segment' });
        }
        const targets = await resolveSegmentTargets(segment);
        for (const t of targets) {
          const email = normalizeEmail(t.email);
          if (!email || !EMAIL_RE.test(email)) continue;
          byEmail.set(email, {
            email,
            name: t.name || byEmail.get(email)?.name || null
          });
        }
      }

      if (req.body?.includeNewsletter === true) {
        const subs = await prisma.newsletterSubscriber.findMany({
          where: { status: 'ACTIVE' },
          select: { email: true, name: true }
        });
        for (const s of subs) {
          const email = normalizeEmail(s.email);
          if (!EMAIL_RE.test(email)) continue;
          byEmail.set(email, {
            email,
            name: s.name || byEmail.get(email)?.name || null
          });
        }
      }

      const recipients = Array.from(byEmail.values());
      if (recipients.length === 0) {
        return res.status(400).json({ error: 'Add at least one valid recipient' });
      }
      if (recipients.length > MAX_RECIPIENTS) {
        return res.status(400).json({
          error: `Too many recipients (max ${MAX_RECIPIENTS}). Narrow the list or send in batches.`
        });
      }

      if (dryRun) {
        return res.json({
          dryRun: true,
          from: effectiveFrom,
          recipientCount: recipients.length,
          sample: recipients.slice(0, 20)
        });
      }

      const batch = await prisma.outboundEmail.create({
        data: {
          staffId: req.platformStaff.id,
          subject,
          body,
          templateId,
          recipientCount: recipients.length,
          status: 'PENDING',
          recipients: {
            create: recipients.map(r => ({
              email: r.email,
              name: r.name,
              status: 'PENDING'
            }))
          }
        },
        include: { recipients: true }
      });

      let sentCount = 0;
      let failedCount = 0;

      for (const recip of batch.recipients) {
        try {
          await sendCampaignEmail({
            to: recip.email,
            subject: applyVars(subject, recip.name, recip.email),
            bodyText: applyVars(body, recip.name, recip.email),
            from: effectiveFrom
          });
          sentCount += 1;
          await prisma.outboundEmailRecipient.update({
            where: { id: recip.id },
            data: { status: 'SENT', sentAt: new Date(), error: null }
          });
        } catch (e: any) {
          failedCount += 1;
          await prisma.outboundEmailRecipient.update({
            where: { id: recip.id },
            data: {
              status: 'FAILED',
              error: e?.message || 'send failed'
            }
          });
        }
      }

      const status =
        failedCount === 0 ? 'COMPLETED' : sentCount === 0 ? 'FAILED' : 'PARTIAL';

      const updated = await prisma.outboundEmail.update({
        where: { id: batch.id },
        data: { sentCount, failedCount, status },
        include: {
          recipients: {
            select: { email: true, status: true, error: true }
          }
        }
      });

      await writePlatformAudit({
        staffId: req.platformStaff.id,
        action: 'OUTBOUND_EMAIL_SEND',
        targetType: 'OutboundEmail',
        targetId: batch.id,
        after: {
          subject,
          from: effectiveFrom,
          recipientCount: recipients.length,
          sentCount,
          failedCount,
          status
        },
        ip: clientIp(req)
      });

      res.json({ email: updated, from: effectiveFrom });
    } catch (error) {
      console.error('Mail send error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
