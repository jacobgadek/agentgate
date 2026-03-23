import { Hono } from 'hono';
import { SDK_VERSION, PROTOCOL_METADATA, Protocol } from '@agentgate/core';
import { getAdapterNames } from '../services/routing.service.js';

const health = new Hono();

health.get('/health', (c) => {
  return c.json({
    status: 'ok',
    version: SDK_VERSION,
    timestamp: new Date().toISOString(),
  });
});

health.get('/protocols', (c) => {
  const active = getAdapterNames();
  const protocols = Object.entries(PROTOCOL_METADATA).map(([key, meta]) => ({
    id: key,
    ...meta,
    active: active.includes(key),
  }));
  return c.json({ protocols });
});

export { health };
