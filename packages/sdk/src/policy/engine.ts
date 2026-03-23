import type { AgentPolicies, PolicyCheckResult, PolicyViolation, TransactionRequest } from '@agentgate/core';

export function evaluatePolicy(
  policies: AgentPolicies,
  request: TransactionRequest,
  dailySpentSoFar: number = 0,
): PolicyCheckResult {
  const violations: PolicyViolation[] = [];

  // Check max transaction amount
  if (request.item.amount > policies.maxTransactionAmount) {
    violations.push({
      rule: 'maxTransactionAmount',
      message: `Transaction amount $${request.item.amount} exceeds limit of $${policies.maxTransactionAmount}`,
      value: request.item.amount,
      limit: policies.maxTransactionAmount,
    });
  }

  // Check daily spend limit
  if (dailySpentSoFar + request.item.amount > policies.dailySpendLimit) {
    violations.push({
      rule: 'dailySpendLimit',
      message: `Transaction would exceed daily spend limit of $${policies.dailySpendLimit} (already spent $${dailySpentSoFar} today)`,
      value: dailySpentSoFar + request.item.amount,
      limit: policies.dailySpendLimit,
    });
  }

  // Check allowed categories
  if (
    request.item.category &&
    policies.allowedCategories.length > 0 &&
    !policies.allowedCategories.includes(request.item.category)
  ) {
    violations.push({
      rule: 'allowedCategories',
      message: `Category "${request.item.category}" is not in the allowed list`,
      value: request.item.category,
      limit: policies.allowedCategories,
    });
  }

  // Check blocked merchants
  if (policies.blockedMerchants.length > 0) {
    const isBlocked = policies.blockedMerchants.some((m) =>
      request.item.merchantUrl.includes(m),
    );
    if (isBlocked) {
      violations.push({
        rule: 'blockedMerchants',
        message: `Merchant "${request.item.merchantUrl}" is blocked`,
        value: request.item.merchantUrl,
      });
    }
  }

  // Check allowed merchants (unless wildcard)
  if (
    !policies.allowedMerchants.includes('*') &&
    policies.allowedMerchants.length > 0
  ) {
    const isAllowed = policies.allowedMerchants.some((m) =>
      request.item.merchantUrl.includes(m),
    );
    if (!isAllowed) {
      violations.push({
        rule: 'allowedMerchants',
        message: `Merchant "${request.item.merchantUrl}" is not in the allowed list`,
        value: request.item.merchantUrl,
        limit: policies.allowedMerchants,
      });
    }
  }

  return {
    allowed: violations.length === 0,
    violations,
  };
}

export function requiresHumanApproval(
  policies: AgentPolicies,
  amount: number,
): boolean {
  return !!policies.requireHumanApproval && amount > policies.requireHumanApproval.above;
}
