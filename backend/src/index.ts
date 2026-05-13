import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { env } from './config/env.js';
import { prisma } from './config/db.js';
import { authenticate } from './middleware/auth.js';
import authRoutes from './routes/auth.routes.js';
import leaveRoutes from './routes/leave.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import userRoutes from './routes/user.routes.js';
import reshumAdminRoutes from './routes/reshum-admin.routes.js';

const app = express();

// Security headers
app.use(helmet());

// Middleware
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json());

// Rate limiting on auth routes
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' },
});

// Serve uploaded files only to authenticated users
// Supports both Bearer header and ?token= query parameter
app.use('/uploads', (req, res, next) => {
  // Allow token via query string for direct browser access (PDF links)
  if (!req.headers.authorization && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
}, authenticate, express.static(path.resolve(env.UPLOAD_DIR)));

// Routes
app.use('/api/auth', loginLimiter, authRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin/reshum', reshumAdminRoutes);

// Health check with DB ping
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', message: 'Database unreachable' });
  }
});

// Start server
app.listen(env.PORT, () => {
  console.log(`🚀 Server running on http://localhost:${env.PORT}`);
  console.log(`📊 Prisma Studio: run 'pnpm db:studio' in server/`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
