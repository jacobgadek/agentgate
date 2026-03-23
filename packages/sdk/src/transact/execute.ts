import type { TransactionRequest, TransactionResult, AgentIdentity } from '@agentgate/core';
import { evaluatePolicy, requiresHumanApproval } from '../policy/engine.js';
import { PolicyViolationError, AgentNotFoundError } from '../utils/errors.js';
import { TransactionRouter } from './router.js';
import { generateId } from '../utils/crypto.js';

export async function executeTransaction(
  request: TransactionRequest,
  agent: AgentIdentity | undefined,
  router: TransactionRouter,
  dailySpent: number = 0,
): Promise<TransactionResult> {
  if (!agent) {
    throw new AgentNotFoundError(request.agentId);
  }

  // 1. Evaluate policies
  const policyCheck = evaluatePolicy(agent.policies, request, dailySpent);
  if (!policyCheck.allowed) {
    throw new PolicyViolationError(
      `Transaction blocked by policy: ${policyCheck.violations.map((v) => v.message).join('; ')}`,
      policyCheck.violations,
    );
  }

  // 2. Check if human approval is required
  if (requiresHumanApproval(agent.policies, request.item.amount)) {
    const now = new Date().toISOString();
    return {
      id: generateId('txn'),
      agentId: request.agentId,
      status: 'pending_approval',
      protocol: 'mock',
      receipt: null,
      trustImpact: 0,
      policyCheck,
      createdAt: now,
      completedAt: null,
    };
  }

  // 3. Route to best adapter and execute
  const adapter = await router.selectAdapter(request);
  const result = await adapter.execute({
    request,
    agent,
    policyCheck,
  });

  return result;
}
