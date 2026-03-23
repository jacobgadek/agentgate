import type { TrustScore, TrustLevel, AgentIdentity } from '@agentgate/core';
import { TRUST_LEVELS, TRUST_SCORE_MIN, TRUST_SCORE_MAX } from '@agentgate/core';

export function getTrustLevel(score: number): TrustLevel {
  if (score >= TRUST_LEVELS.verified.min) return 'verified';
  if (score >= TRUST_LEVELS.trusted.min) return 'trusted';
  if (score >= TRUST_LEVELS.established.min) return 'established';
  return 'new';
}

export function computeTrustScore(agent: AgentIdentity): TrustScore {
  return {
    agentId: agent.id,
    score: agent.trustScore,
    totalTransactions: agent.totalTransactions,
    successRate: agent.successRate,
    level: getTrustLevel(agent.trustScore),
  };
}

export function applyTrustImpact(currentScore: number, impact: number): number {
  const newScore = currentScore + impact;
  return Math.max(TRUST_SCORE_MIN, Math.min(TRUST_SCORE_MAX, newScore));
}
