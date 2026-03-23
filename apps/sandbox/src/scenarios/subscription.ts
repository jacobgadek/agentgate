import { AgentGate } from '@agentgate/sdk';

/**
 * Subscription scenario: Agent sets up a recurring subscription with strict policies
 */
export async function subscriptionScenario() {
  const gate = new AgentGate({
    apiKey: 'ag_dev_sandbox_subscription',
    environment: 'sandbox',
  });

  const agent = await gate.identity.register({
    name: 'subscription-manager',
    owner: 'user_demo',
    capabilities: ['subscribe'],
    policies: {
      maxTransactionAmount: 50,
      allowedCategories: [],
      requireHumanApproval: { above: 25 },
      allowedMerchants: ['mock-saas.agentgate.dev'],
      dailySpendLimit: 100,
      blockedMerchants: [],
    },
  });

  // This one goes through — under $25
  const txn1 = await gate.transact({
    agentId: agent.id,
    intent: 'subscribe',
    item: {
      description: 'Basic SaaS Plan',
      amount: 19.99,
      currency: 'USD',
      merchantUrl: 'https://mock-saas.agentgate.dev/plans/basic',
    },
    preferredProtocol: 'auto',
  });

  // This one requires approval — over $25
  const txn2 = await gate.transact({
    agentId: agent.id,
    intent: 'subscribe',
    item: {
      description: 'Pro SaaS Plan',
      amount: 49.99,
      currency: 'USD',
      merchantUrl: 'https://mock-saas.agentgate.dev/plans/pro',
    },
    preferredProtocol: 'auto',
  });

  return {
    agent,
    transactions: [txn1, txn2],
    trust: await gate.trust.score(agent.id),
  };
}
