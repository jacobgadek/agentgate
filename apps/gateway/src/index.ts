import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { randomUUID } from 'node:crypto';
import { initializeDatabase, db, schema } from './db/index.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { health } from './routes/health.js';
import { identity } from './routes/identity.js';
import { transact } from './routes/transact.js';
import { trust } from './routes/trust.js';

// ── Initialize database ─────────────────────────────────────
initializeDatabase();

// Seed a sandbox developer if none exists
const existingDev = await db.query.developers.findFirst();
if (!existingDev) {
  const devId = `dev_${randomUUID().replace(/-/g, '')}`;
  await db.insert(schema.developers).values({
    id: devId,
    apiKey: 'ag_dev_sandbox_key',
    email: 'sandbox@agentgate.dev',
    plan: 'free',
    createdAt: new Date().toISOString(),
  });
  console.log(`[gateway] Seeded sandbox developer (API key: ag_dev_sandbox_key)`);
}

// ── Create Hono app ─────────────────────────────────────────
const app = new Hono();

// Global middleware
app.use('*', cors());
app.use('*', logger());

// Public routes (no auth)
app.route('/v1', health);

// Protected routes (require API key)
app.use('/v1/identity', authMiddleware);
app.use('/v1/identity', rateLimitMiddleware);
app.use('/v1/identity/*', authMiddleware);
app.use('/v1/identity/*', rateLimitMiddleware);
app.route('/v1/identity', identity);

app.use('/v1/transact', authMiddleware);
app.use('/v1/transact', rateLimitMiddleware);
app.use('/v1/transact/*', authMiddleware);
app.use('/v1/transact/*', rateLimitMiddleware);
app.route('/v1/transact', transact);

app.use('/v1/trust/*', authMiddleware);
app.use('/v1/trust/*', rateLimitMiddleware);
app.route('/v1/trust', trust);

// 404 fallback
app.notFound((c) => c.json({ error: 'Not found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error('[gateway] Error:', err.message);
  return c.json({ error: 'Internal server error' }, 500);
});

// ── Start server ────────────────────────────────────────────
const port = Number(process.env.PORT ?? 3100);

serve({ fetch: app.fetch, port }, () => {
  console.log(`\n[gateway] AgentGate Gateway running on http://localhost:${port}`);
  console.log(`[gateway] Health check: http://localhost:${port}/v1/health`);
  console.log(`[gateway] API key for sandbox: ag_dev_sandbox_key\n`);
});
