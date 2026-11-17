import { Router } from 'express';
import { prisma } from '../index';
import { rateLimit } from '../rateLimit';

const router = Router();

const intakeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  name: 'marketing-intake'
});

router.post('/newsletter/subscribe', intakeLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const name = req.body?.name ? String(req.body.name).trim() : null;
    const source = String(req.body?.source || 'website').trim().slice(0, 64);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });
    if (existing) {
      if (existing.status === 'UNSUBSCRIBED') {
        const restored = await prisma.newsletterSubscriber.update({
          where: { email },
          data: {
            status: 'ACTIVE',
            name: name || existing.name,
            source,
            unsubscribedAt: null,
            subscribedAt: new Date()
          }
        });
        return res.json({ ok: true, subscriber: { email: restored.email } });
      }
      return res.json({ ok: true, subscriber: { email: existing.email } });
    }

    const subscriber = await prisma.newsletterSubscriber.create({
      data: { email, name, source, status: 'ACTIVE' }
    });
    res.status(201).json({ ok: true, subscriber: { email: subscriber.email } });
  } catch (error) {
    console.error('Newsletter subscribe error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/join-requests', intakeLimiter, async (req, res) => {
  try {
    const companyName = String(req.body?.companyName || '').trim();
    const contactName = String(req.body?.contactName || '').trim();
    const contactEmail = String(req.body?.contactEmail || '').trim().toLowerCase();
    const message = req.body?.message ? String(req.body.message).trim().slice(0, 2000) : null;

    if (!companyName || !contactName || !contactEmail) {
      return res.status(400).json({ error: 'companyName, contactName, and contactEmail are required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      return res.status(400).json({ error: 'Valid contactEmail is required' });
    }

    const pending = await prisma.workspaceJoinRequest.findFirst({
      where: { contactEmail, status: 'PENDING' }
    });
    if (pending) {
      return res.json({ ok: true, requestId: pending.id, message: 'Request already pending' });
    }

    const request = await prisma.workspaceJoinRequest.create({
      data: {
        companyName,
        contactName,
        contactEmail,
        message,
        status: 'PENDING'
      }
    });

    res.status(201).json({ ok: true, requestId: request.id });
  } catch (error) {
    console.error('Join request create error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
