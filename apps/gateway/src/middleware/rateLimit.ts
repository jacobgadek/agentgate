import { createMiddleware } from 'hono/factory';
import { RATE_LIMITS } from '@agentgate/core';
import type { AuthEnv } from './auth.js';

// Simple in-memory rate limiter (swap for Redis/Upstash in production)
const windows: Map<string, { count: number; resetAt: number }> = new Map();

const WINDOW_MS = 60_000; // 1 minute

export const rateLimitMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const developerId = c.get('developerId');
  const plan = c.get('developerPlan') as keyof typeof RATE_LIMITS;
  const limit = RATE_LIMITS[plan] ?? RATE_LIMITS.free;

  const now = Date.now();
  let window = windows.get(developerId);

  if (!window || now > window.resetAt) {
    window = { count: 0, resetAt: now + WINDOW_MS };
    windows.set(developerId, window);
  }

  window.count++;

  c.header('X-RateLimit-Limit', String(limit));
  c.header('X-RateLimit-Remaining', String(Math.max(0, limit - window.count)));
  c.header('X-RateLimit-Reset', String(Math.ceil(window.resetAt / 1000)));

  if (window.count > limit) {
    return c.json({ error: 'Rate limit exceeded' }, 429);
  }

  await next();
});
