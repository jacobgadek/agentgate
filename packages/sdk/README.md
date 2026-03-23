# @agentgate/sdk

**One SDK. Every agentic payment rail.**

AgentGate is the interoperability layer for AI agent transactions. Integrate once and route transactions through Stripe ACP, Coinbase x402, Mastercard Agent Pay, Google A2A, and more — with built-in identity management, policy enforcement, and trust scoring.

Think **Plaid, but for AI agents.** Plaid connects fintech apps to banks. AgentGate connects AI agents to commerce protocols.

---

## Why AgentGate?

AI agents are starting to buy things. But there's no standard for how they do it.

Every protocol — Stripe ACP, Coinbase x402, Mastercard Agent Pay — has its own identity model, its own authorization flow, and its own API surface. If your agent needs to transact across protocols, you're writing and maintaining a separate integration for each one.

AgentGate fixes this:

- **One integration** instead of five. Add a protocol adapter, not a rewrite.
- **Policy enforcement** built in. Set spending limits, merchant allowlists, category restrictions, and human approval thresholds — and they're enforced on every transaction.
- **Trust scoring** that merchants can query. Your agent builds a verifiable reputation over time.
- **Automatic routing** to the cheapest, most reliable protocol for each transaction.
- **Append-only audit trail** with cryptographic hash chains. Every action is logged and tamper-evident.

---

## Quickstart

```bash
npm install @agentgate/sdk
```

```typescript
import { AgentGate } from '@agentgate/sdk';

const gate = new AgentGate({ apiKey: 'ag_dev_xxxx', environment: 'sandbox' });

// Register an agent with spending policies
const agent = await gate.identity.register({
  name: 'shopping-assistant',
  owner: 'user_12345',
  capabilities: ['purchase', 'compare'],
  policies: {
    maxTransactionAmount: 500,
    allowedCategories: ['electronics', 'books'],
    requireHumanApproval: { above: 100 },
    allowedMerchants: ['*'],
    dailySpendLimit: 1000,
    blockedMerchants: [],
  },
});

// Execute a transaction — routed automatically to the best protocol
const txn = await gate.transact({
  agentId: agent.id,
  intent: 'purchase',
  item: {
    description: 'Sony WH-1000XM5 Headphones',
    amount: 278.00,
    currency: 'USD',
    merchantUrl: 'https://amazon.com/dp/B09XS7JWHH',
  },
  preferredProtocol: 'auto',
});

console.log(txn.status);    // 'completed' | 'pending_approval' | 'rejected'
console.log(txn.protocol);  // 'stripe-acp' (which rail was used)

// Check the agent's trust score
const trust = await gate.trust.score(agent.id);
console.log(trust.score);   // 52
console.log(trust.level);   // 'established'
```

That's it. The SDK handles protocol selection, policy checks, human approval gating, and trust score updates.

---

## How It Works

```
Your Agent (LangChain, CrewAI, custom)
         │
         ▼
   ┌─────────────┐
   │  AgentGate   │  ← You integrate here. Once.
   │     SDK      │
   └──────┬──────┘
          │  policy check → protocol selection → execute
          ▼
   ┌─────────────────────────────────────┐
   │         Protocol Adapters           │
   │  Stripe ACP │ x402 │ MC Agent Pay  │
   └──────┬──────────────────────────────┘
          │
          ▼
     Merchants / Services
```

1. **Agent registers** with identity and policies
2. **Transaction request** comes in — the SDK checks policies first
3. If the amount exceeds the human approval threshold, the transaction pauses for approval
4. If policies pass, the **router selects** the best protocol adapter
5. The adapter executes the full protocol handshake (e.g., ACP checkout → SPT → complete)
6. **Trust score updates** based on the outcome
7. Everything is written to the **audit trail**

---

## API Reference

### `new AgentGate(config)`

| Parameter | Type | Description |
|---|---|---|
| `apiKey` | `string` | Your developer API key |
| `environment` | `'sandbox' \| 'production'` | Default: `'sandbox'` |
| `gatewayUrl` | `string` | Custom gateway URL (optional) |
| `adapters` | `ProtocolAdapter[]` | Custom adapters (optional) |

### `gate.identity.register(request)`

Register an agent identity with policies.

```typescript
const agent = await gate.identity.register({
  name: 'shopping-assistant',
  owner: 'user_12345',
  capabilities: ['purchase', 'compare', 'subscribe'],
  policies: {
    maxTransactionAmount: 500,      // Max per transaction (USD)
    allowedCategories: ['electronics', 'books', 'groceries'],
    requireHumanApproval: {
      above: 100,                   // Pause for approval above this amount
    },
    allowedMerchants: ['*'],        // '*' = any, or specific merchant IDs
    dailySpendLimit: 1000,
    blockedMerchants: [],
  },
});
```

**Returns:** `AgentIdentity` — includes `id`, `trustScore`, `status`, and all registration data.

### `gate.identity.verify(agentId)`

Verify an agent's identity status.

```typescript
const result = gate.identity.verify(agent.id);
// { valid: true, agent: { ... }, reason: undefined }
```

### `gate.identity.get(agentId)`

Retrieve a registered agent by ID.

### `gate.transact(request)`

Execute a transaction through the best available protocol.

```typescript
const txn = await gate.transact({
  agentId: agent.id,
  intent: 'purchase',               // 'purchase' | 'subscribe' | 'compare' | 'refund'
  item: {
    description: 'Product name',
    amount: 42.99,
    currency: 'USD',                 // 'USD' | 'EUR' | 'GBP'
    merchantUrl: 'https://...',
    category: 'books',               // Optional — used for policy checks
  },
  preferredProtocol: 'auto',        // 'auto' | 'stripe-acp' | 'x402' | 'mc-agent-pay'
  metadata: { reason: '...' },      // Optional — stored with the transaction
});
```

**Returns:** `TransactionResult`

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Transaction ID |
| `status` | `string` | `'completed'`, `'pending_approval'`, `'rejected'`, `'failed'` |
| `protocol` | `string` | Which protocol was used |
| `receipt` | `object \| null` | Protocol-specific receipt data |
| `trustImpact` | `number` | How this affected the agent's trust score |
| `policyCheck` | `object` | Policy evaluation result |

### `gate.trust.score(agentId)`

Get an agent's trust score.

```typescript
const trust = await gate.trust.score(agent.id);
```

| Field | Type | Description |
|---|---|---|
| `score` | `number` | 0-100 trust score |
| `level` | `string` | `'new'` (0-29), `'established'` (30-59), `'trusted'` (60-84), `'verified'` (85-100) |
| `totalTransactions` | `number` | Lifetime transaction count |
| `successRate` | `number` | Success rate (0.0 - 1.0) |

### `gate.registerAdapter(adapter)`

Register a custom protocol adapter.

```typescript
import { StripeACPAdapter } from '@agentgate/sdk';

gate.registerAdapter(new StripeACPAdapter({
  stripeSecretKey: 'sk_test_...',
}));
```

### `gate.listProtocols()`

List all registered protocol adapter names.

---

## Protocol Adapters

| Protocol | Status | Description |
|---|---|---|
| Mock | Available | Simulated protocol for sandbox testing |
| Stripe ACP | Available | Stripe's Agentic Commerce Protocol |
| Coinbase x402 | Coming Soon | HTTP 402-based micropayments |
| Mastercard Agent Pay | Coming Soon | Mastercard's agent payment rail |
| Google A2A | Coming Soon | Google's Agent-to-Agent protocol |

### Using Stripe ACP

```typescript
import { AgentGate, StripeACPAdapter } from '@agentgate/sdk';

const gate = new AgentGate({
  apiKey: 'ag_dev_xxxx',
  environment: 'sandbox',
  adapters: [
    new StripeACPAdapter({ stripeSecretKey: process.env.STRIPE_SECRET_KEY! }),
  ],
});

// Transactions now route through Stripe ACP when available
const txn = await gate.transact({
  agentId: agent.id,
  intent: 'purchase',
  item: { description: 'Book', amount: 29.99, currency: 'USD', merchantUrl: '...' },
  preferredProtocol: 'stripe-acp',  // or 'auto' to let the router decide
});
```

### Building a Custom Adapter

Implement the `ProtocolAdapter` interface:

```typescript
import type { ProtocolAdapter } from '@agentgate/sdk';

class MyAdapter implements ProtocolAdapter {
  name = 'my-protocol' as const;

  async isAvailable() { return true; }
  supportsIntent(intent) { return intent === 'purchase'; }
  async estimateFee(txn) { return { /* ... */ }; }
  async execute(txn) { return { /* ... */ }; }
  async verify(receipt) { return { /* ... */ }; }
}

gate.registerAdapter(new MyAdapter());
```

---

## Policies

Policies are enforced on every transaction before it reaches a protocol adapter. If a transaction violates any policy, it's rejected immediately — the adapter never sees it.

| Policy | Type | Description |
|---|---|---|
| `maxTransactionAmount` | `number` | Maximum amount per transaction |
| `dailySpendLimit` | `number` | Maximum total spend per day |
| `allowedCategories` | `string[]` | Restrict to specific categories |
| `allowedMerchants` | `string[]` | `['*']` for any, or specific merchant IDs |
| `blockedMerchants` | `string[]` | Block specific merchants |
| `requireHumanApproval` | `{ above: number }` | Transactions above this amount return `pending_approval` |

---

## Gateway API

The hosted gateway provides a REST API for server-side integrations, persistent storage, and the trust registry.

```bash
# Health check
curl http://localhost:3100/v1/health

# Register an agent
curl -X POST http://localhost:3100/v1/identity/register \
  -H "Authorization: Bearer ag_dev_sandbox_key" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-agent", "owner": "user_1", "capabilities": ["purchase"], "policies": {...}}'

# Execute a transaction
curl -X POST http://localhost:3100/v1/transact \
  -H "Authorization: Bearer ag_dev_sandbox_key" \
  -H "Content-Type: application/json" \
  -d '{"agentId": "agent_xxx", "intent": "purchase", "item": {...}, "preferredProtocol": "auto"}'

# Check trust score
curl http://localhost:3100/v1/trust/agent_xxx \
  -H "Authorization: Bearer ag_dev_sandbox_key"
```

See the [full API reference](https://docs.agentgate.dev/api-reference) for all endpoints.

---

## Examples

- **[Simple Purchase](../../examples/simple-purchase)** — Full flow in under 20 lines
- **[LangChain Shopping Agent](../../examples/langchain-shopping-agent)** — AI agent that comparison-shops through AgentGate
- **[Sandbox Demo](../../apps/sandbox)** — Interactive demo with mock merchants

---

## Development

```bash
# Clone and install
git clone https://github.com/agentgate/agentgate.git
cd agentgate
pnpm install

# Build everything
pnpm build

# Run the sandbox demo
pnpm --filter @agentgate/sandbox dev

# Run the gateway API
pnpm --filter @agentgate/gateway dev

# Run tests
node --import tsx --test packages/sdk/test/stripe-acp.test.ts
```

---

## License

MIT
