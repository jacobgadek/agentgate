import { createMiddleware } from 'hono/factory';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

export type AuthEnv = {
  Variables: {
    developerId: string;
    developerPlan: string;
  };
};

/**
 * API key authentication middleware.
 * Expects header: Authorization: Bearer ag_dev_xxxxx
 */
export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const apiKey = authHeader.slice(7);
  if (!apiKey) {
    return c.json({ error: 'API key is required' }, 401);
  }

  const developer = await db.query.developers.findFirst({
    where: eq(schema.developers.apiKey, apiKey),
  });

  if (!developer) {
    return c.json({ error: 'Invalid API key' }, 401);
  }

  c.set('developerId', developer.id);
  c.set('developerPlan', developer.plan);
  await next();
});
