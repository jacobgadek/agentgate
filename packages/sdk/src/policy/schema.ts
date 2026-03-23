import type { AgentPolicies } from '@agentgate/core';

/** Default policies for new agents */
export const DEFAULT_POLICIES: AgentPolicies = {
  maxTransactionAmount: 100,
  allowedCategories: [],
  requireHumanApproval: { above: 50 },
  allowedMerchants: ['*'],
  dailySpendLimit: 500,
  blockedMerchants: [],
};

/** Validates that policies contain required fields with sane values */
export function validatePolicies(policies: AgentPolicies): string[] {
  const errors: string[] = [];

  if (policies.maxTransactionAmount <= 0) {
    errors.push('maxTransactionAmount must be positive');
  }
  if (policies.dailySpendLimit <= 0) {
    errors.push('dailySpendLimit must be positive');
  }
  if (policies.dailySpendLimit < policies.maxTransactionAmount) {
    errors.push('dailySpendLimit should be >= maxTransactionAmount');
  }
  if (policies.requireHumanApproval && policies.requireHumanApproval.above < 0) {
    errors.push('requireHumanApproval.above must be non-negative');
  }

  return errors;
}
