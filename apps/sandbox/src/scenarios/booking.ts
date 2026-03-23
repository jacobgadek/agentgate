import { AgentGate } from '@agentgate/sdk';

/**
 * Booking scenario: Agent subscribes to a service
 */
export async function bookingScenario() {
  const gate = new AgentGate({
    apiKey: 'ag_dev_sandbox_booking',
    environment: 'sandbox',
  });

  const agent = await gate.identity.register({
    name: 'booking-agent',
    owner: 'user_demo',
    capabilities: ['subscribe'],
    policies: {
      maxTransactionAmount: 100,
      allowedCategories: [],
      allowedMerchants: ['*'],
      dailySpendLimit: 200,
      blockedMerchants: [],
    },
  });

  const txn = await gate.transact({
    agentId: agent.id,
    intent: 'subscribe',
    item: {
      description: 'Monthly Cloud Hosting Plan',
      amount: 29.99,
      currency: 'USD',
      merchantUrl: 'https://mock-hosting.agentgate.dev/plans/basic',
    },
    preferredProtocol: 'auto',
  });

  return { agent, txn, trust: await gate.trust.score(agent.id) };
}
