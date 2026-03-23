import { Hono } from 'hono';
import * as trustService from '../services/trust.service.js';

const trust = new Hono();

// GET /v1/trust/:agentId
trust.get('/:agentId', async (c) => {
  const agentId = c.req.param('agentId');
  const score = await trustService.getTrustScore(agentId);
  if (!score) return c.json({ error: 'Agent not found' }, 404);
  return c.json(score);
});

// GET /v1/trust/:agentId/report
trust.get('/:agentId/report', async (c) => {
  const agentId = c.req.param('agentId');
  const report = await trustService.getTrustReport(agentId);
  if (!report) return c.json({ error: 'Agent not found' }, 404);
  return c.json(report);
});

export { trust };
