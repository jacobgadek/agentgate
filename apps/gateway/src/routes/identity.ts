import { Hono } from 'hono';
import type { AuthEnv } from '../middleware/auth.js';
import * as identityService from '../services/identity.service.js';

const identity = new Hono<AuthEnv>();

// GET /v1/identity — list all agents for developer
identity.get('/', async (c) => {
  const developerId = c.get('developerId');
  const agents = await identityService.listAgents(developerId);
  return c.json({ agents });
});

// POST /v1/identity/register
identity.post('/register', async (c) => {
  const developerId = c.get('developerId');
  const body = await c.req.json();

  if (!body.name || !body.owner || !body.capabilities || !body.policies) {
    return c.json({ error: 'Missing required fields: name, owner, capabilities, policies' }, 400);
  }

  const agent = await identityService.registerAgent(developerId, {
    name: body.name,
    owner: body.owner,
    capabilities: body.capabilities,
    policies: body.policies,
  });

  return c.json(agent, 201);
});

// GET /v1/identity/:agentId
identity.get('/:agentId', async (c) => {
  const developerId = c.get('developerId');
  const agentId = c.req.param('agentId');

  const agent = await identityService.getAgentByDeveloper(agentId, developerId);
  if (!agent) return c.json({ error: 'Agent not found' }, 404);

  return c.json(agent);
});

// POST /v1/identity/verify
identity.post('/verify', async (c) => {
  const body = await c.req.json();
  if (!body.agentId) return c.json({ error: 'agentId is required' }, 400);

  const result = await identityService.verifyAgent(body.agentId);
  return c.json(result);
});

export { identity };
