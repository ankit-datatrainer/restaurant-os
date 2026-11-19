import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config, isProd } from './config.js';
import { errorMiddleware } from './lib/errors.js';
import { publicRouter } from './routes/public.js';
import { adminRouter } from './routes/admin/index.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin(origin, cb) {
        // Allow same-origin / curl (no Origin header) and configured origins.
        if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
        if (!isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
        return cb(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan(isProd ? 'combined' : 'dev'));

  app.get('/', (_req, res) => {
    res.json({ name: 'Restaurant OS API', ok: true, docs: '/api/health' });
  });
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString(), serviceRole: Boolean(config.supabaseServiceRoleKey) });
  });

  app.use('/api/public', publicRouter);
  app.use('/api/admin', adminRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });
  app.use(errorMiddleware);

  return app;
}
