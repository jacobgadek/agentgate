import { AgentGate } from '@agentgate/sdk';
const gate = new AgentGate({ 
  apiKey: 'ag_dev_sandbox_key', 
  environment: 'sandbox',
  gatewayUrl: 'http://localhost:3100'
});
const agent = await gate.identity.register({
  name: 'shopper-bot',
  capabilities: ['purchase'],
  policies: { maxTransactionAmount: 100, dailySpendLimit: 500 },
});
const result = await gate.transact({
  agentId: agent.id,
  intent: 'purchase',
  preferredProtocol: 'auto',
  item: { description: 'Large cold brew', amount: 29.99, currency: 'USD', merchantUrl: 'https://coffee-shop.example.com' },
});
console.log(`Transaction ${result.status}: $${result.receipt?.amount} (${result.receipt?.transactionId})`);
