import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __serverDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__serverDir, '../.env'), override: true });

const app = express();
const port = process.env.PORT || 3001;

// Global Prisma Client instance
export const prisma = new PrismaClient();

app.use(
  cors({
    origin: (origin, callback) => {
      // Non-browser / same-origin requests
      if (!origin) return callback(null, true);

      const allowed = new Set<string>();
      const add = (value?: string) => {
        const v = (value || '').trim().replace(/\/$/, '');
        if (v) allowed.add(v);
      };

      add(process.env.FRONTEND_URL);
      add(process.env.PLATFORM_ADMIN_URL);
      add(process.env.MARKETING_URL);
      // Comma-separated extras (preview URLs, temporary Render hosts)
      for (const part of String(process.env.CORS_ORIGINS || '').split(',')) {
        add(part);
      }

      // Local Vite (product + platform admin + marketing)
      if (process.env.NODE_ENV !== 'production') {
        add('http://127.0.0.1:3000');
        add('http://localhost:3000');
        add('http://127.0.0.1:3010');
        add('http://localhost:3010');
        add('http://127.0.0.1:3020');
        add('http://localhost:3020');
      }

      if (allowed.size === 0 || allowed.has(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true
  })
);
app.use(express.json());

import authRoutes from './routes/auth.routes';
import workspaceRoutes from './routes/workspace.routes';
import departmentRoutes from './routes/department.routes';
import projectRoutes from './routes/project.routes';
import taskRoutes from './routes/task.routes';
import chatRoutes from './routes/chat.routes';
import commentRoutes from './routes/comment.routes';
import notificationRoutes from './routes/notification.routes';
import activityRoutes from './routes/activity.routes';
import platformRoutes from './platform/routes';
import marketingRoutes from './routes/marketing.routes';
import { authenticate } from './routes/auth.routes';
import { requireActiveWorkspace } from './middleware/entitlements';
import { resolveEntitlements } from './entitlements';

app.use('/api/auth', authRoutes);
app.use('/api', marketingRoutes);
app.use('/api/workspaces', authenticate, requireActiveWorkspace, workspaceRoutes);
app.use('/api/departments', authenticate, requireActiveWorkspace, departmentRoutes);
app.use('/api/projects', authenticate, requireActiveWorkspace, projectRoutes);
app.use('/api/tasks', authenticate, requireActiveWorkspace, taskRoutes);
app.use('/api/chat', authenticate, requireActiveWorkspace, chatRoutes);
app.use('/api/comments', authenticate, requireActiveWorkspace, commentRoutes);
app.use('/api/notifications', authenticate, requireActiveWorkspace, notificationRoutes);
app.use('/api/activity', authenticate, requireActiveWorkspace, activityRoutes);

app.get('/api/entitlements', authenticate, async (req: any, res) => {
  try {
    const entitlements = await resolveEntitlements(req.actor.workspaceId);
    if (!entitlements) return res.status(404).json({ error: 'Workspace not found' });
    res.json(entitlements);
  } catch (error) {
    console.error('Entitlements error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Platform ops API — separate auth; never accept product JWTs here.
app.use('/platform/api', platformRoutes);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    frontendUrl: process.env.FRONTEND_URL || null
  });
});

// Serve frontend in production
const __dirname = path.resolve();
app.use(express.static(path.join(__dirname, 'dist')));

app.get(/.*/, (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/platform')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log(`FRONTEND_URL=${process.env.FRONTEND_URL || '(not set)'}`);
});
