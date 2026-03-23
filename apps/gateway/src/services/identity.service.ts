import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { TRUST_SCORE_INITIAL } from '@agentgate/core';
import { appendAuditLog } from '../middleware/audit.js';

export interface RegisterAgentInput {
  name: string;
  owner: string;
  capabilities: string[];
  policies: {
    maxTransactionAmount: number;
    allowedCategories: string[];
    requireHumanApproval?: { above: number };
    allowedMerchants: string[];
    dailySpendLimit: number;
    blockedMerchants: string[];
  };
}

export async function registerAgent(developerId: string, input: RegisterAgentInput) {
  const id = `agent_${randomUUID().replace(/-/g, '')}`;
  const now = new Date().toISOString();

  const agent = {
    id,
    developerId,
    name: input.name,
    ownerUserId: input.owner,
    capabilities: input.capabilities,
    policies: input.policies,
    trustScore: TRUST_SCORE_INITIAL,
    totalTransactions: 0,
    successRate: 1.0,
    status: 'active' as const,
    createdAt: now,
  };

  await db.insert(schema.agents).values(agent);

  await appendAuditLog({
    agentId: id,
    eventType: 'agent_registered',
    eventData: { name: input.name, owner: input.owner },
  });

  return agent;
}

export async function listAgents(developerId: string) {
  return db.query.agents.findMany({
    where: eq(schema.agents.developerId, developerId),
    orderBy: (a, { desc }) => [desc(a.createdAt)],
  });
}

export async function getAgent(agentId: string) {
  return db.query.agents.findFirst({
    where: eq(schema.agents.id, agentId),
  });
}

export async function getAgentByDeveloper(agentId: string, developerId: string) {
  return db.query.agents.findFirst({
    where: (a, { and, eq }) =>
      and(eq(a.id, agentId), eq(a.developerId, developerId)),
  });
}

export async function verifyAgent(agentId: string) {
  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, agentId),
  });

  if (!agent) return { valid: false, reason: 'Agent not found', agent: null };
  if (agent.status === 'suspended') return { valid: false, reason: 'Agent is suspended', agent };
  if (agent.status === 'revoked') return { valid: false, reason: 'Agent identity revoked', agent };

  return { valid: true, reason: null, agent };
}
