import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { TRUST_LEVELS } from '@agentgate/core';
import type { TrustLevel } from '@agentgate/core';

function getTrustLevel(score: number): TrustLevel {
  if (score >= TRUST_LEVELS.verified.min) return 'verified';
  if (score >= TRUST_LEVELS.trusted.min) return 'trusted';
  if (score >= TRUST_LEVELS.established.min) return 'established';
  return 'new';
}

export async function getTrustScore(agentId: string) {
  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, agentId),
  });

  if (!agent) return null;

  return {
    agentId: agent.id,
    score: agent.trustScore,
    totalTransactions: agent.totalTransactions,
    successRate: agent.successRate,
    level: getTrustLevel(agent.trustScore),
  };
}

export async function getTrustReport(agentId: string) {
  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, agentId),
  });

  if (!agent) return null;

  const events = await db.query.trustEvents.findMany({
    where: eq(schema.trustEvents.agentId, agentId),
    orderBy: (te, { desc }) => [desc(te.createdAt)],
    limit: 50,
  });

  const auditEntries = await db.query.auditLogs.findMany({
    where: eq(schema.auditLogs.agentId, agentId),
    orderBy: (al, { desc }) => [desc(al.createdAt)],
    limit: 20,
  });

  return {
    agentId: agent.id,
    name: agent.name,
    score: agent.trustScore,
    level: getTrustLevel(agent.trustScore),
    totalTransactions: agent.totalTransactions,
    successRate: agent.successRate,
    status: agent.status,
    registeredAt: agent.createdAt,
    recentTrustEvents: events,
    recentAuditEntries: auditEntries,
  };
}
