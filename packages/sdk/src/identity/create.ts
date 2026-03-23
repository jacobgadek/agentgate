import type { AgentIdentity, RegisterAgentRequest } from '@agentgate/core';
import { TRUST_SCORE_INITIAL } from '@agentgate/core';
import { generateId } from '../utils/crypto.js';
import { DEFAULT_POLICIES } from '../policy/schema.js';

export function createAgentIdentity(
  request: RegisterAgentRequest,
  developerId: string,
): AgentIdentity {
  return {
    id: generateId('agent'),
    developerId,
    name: request.name,
    owner: request.owner,
    capabilities: request.capabilities,
    policies: { ...DEFAULT_POLICIES, ...request.policies },
    trustScore: TRUST_SCORE_INITIAL,
    totalTransactions: 0,
    successRate: 1.0,
    status: 'active',
    createdAt: new Date().toISOString(),
  };
}
