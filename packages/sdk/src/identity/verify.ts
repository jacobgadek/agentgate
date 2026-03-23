import type { AgentIdentity } from '@agentgate/core';

export interface VerifyIdentityResult {
  valid: boolean;
  agent: AgentIdentity | null;
  reason?: string;
}

export function verifyAgentIdentity(agent: AgentIdentity | undefined): VerifyIdentityResult {
  if (!agent) {
    return { valid: false, agent: null, reason: 'Agent not found' };
  }

  if (agent.status === 'suspended') {
    return { valid: false, agent, reason: 'Agent is suspended' };
  }

  if (agent.status === 'revoked') {
    return { valid: false, agent, reason: 'Agent identity has been revoked' };
  }

  return { valid: true, agent };
}
