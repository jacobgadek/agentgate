import { AgentGate } from '@agentgate/sdk';
import { MockMerchant } from '../mock-merchant.js';

/**
 * Shopping scenario: Agent compares products and makes a purchase
 */
export async function shoppingScenario() {
  const gate = new AgentGate({
    apiKey: 'ag_dev_sandbox_shopping',
    environment: 'sandbox',
  });

  const agent = await gate.identity.register({
    name: 'comparison-shopper',
    owner: 'user_demo',
    capabilities: ['purchase', 'compare'],
    policies: {
      maxTransactionAmount: 200,
      allowedCategories: ['electronics', 'books'],
      requireHumanApproval: { above: 150 },
      allowedMerchants: ['*'],
      dailySpendLimit: 500,
      blockedMerchants: [],
    },
  });

  const merchant = new MockMerchant();
  const electronics = merchant.search('electronics');

  // Find the cheapest product in category
  const cheapest = electronics.sort((a, b) => a.price - b.price)[0];

  const txn = await gate.transact({
    agentId: agent.id,
    intent: 'purchase',
    item: {
      description: cheapest.name,
      amount: cheapest.price,
      currency: 'USD',
      merchantUrl: cheapest.merchantUrl,
      category: cheapest.category,
    },
    preferredProtocol: 'auto',
  });

  return { agent, txn, trust: await gate.trust.score(agent.id) };
}
