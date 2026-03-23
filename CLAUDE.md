# CLAUDE.md — AgentGate (Working Name)

## What This Is

AgentGate is a developer infrastructure SDK and hosted gateway that sits between AI agents and the fragmented world of agentic commerce protocols. It is the interoperability and trust layer for AI agent transactions.

Think: **Plaid, but for AI agents.** Plaid sits between fintech apps and banks. AgentGate sits between AI agents and payment/identity protocols.

An agent developer integrates our SDK once and gets access to every agentic payment rail — Stripe's Agentic Commerce Protocol, Coinbase's x402, Mastercard Agent Pay, Google's A2A, and more — through a single unified API. We handle identity verification, authorization scoping, transaction routing, and trust scoring.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   Agent (LangChain, CrewAI, etc.)    │
│                                                      │
│   const gate = new AgentGate({ agentId, policies })  │
│   await gate.transact({ ... })                       │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│              AgentGate SDK (@agentgate/sdk)           │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Identity  │  │ Policy   │  │ Transaction       │  │
│  │ Manager   │  │ Engine   │  │ Router            │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│              AgentGate Gateway API                    │
│                                                      │
│  ┌─────────────────────────────────────────────┐     │
│  │           Protocol Adapters                  │     │
│  │                                              │     │
│  │  ┌─────────┐ ┌─────┐ ┌──────┐ ┌─────────┐  │     │
│  │  │Stripe   │ │x402 │ │MC    │ │Google   │  │     │
│  │  │ACP      │ │     │ │Agent │ │A2A      │  │     │
│  │  │         │ │     │ │Pay   │ │         │  │     │
│  │  └─────────┘ └─────┘ └──────┘ └─────────┘  │     │
│  └─────────────────────────────────────────────┘     │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐                  │
│  │ Trust/Rep    │  │ Audit Log    │                  │
│  │ Registry     │  │ (immutable)  │                  │
│  └──────────────┘  └──────────────┘                  │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │  Merchants / Services /     │
         │  Other Agents               │
         └─────────────────────────────┘
```

---

## Tech Stack

- **SDK**: TypeScript, published to npm as `@agentgate/sdk`
- **Gateway API**: Node.js with Hono (lightweight, fast, edge-deployable)
- **Database**: PostgreSQL via Supabase (agents, trust scores, audit logs, policies)
- **Cache/Rate Limiting**: Redis (Upstash for serverless compat)
- **Auth**: API keys for developers, DID-based identity for agents
- **Deployment**: Vercel (API routes) or Railway/Fly.io (long-running processes)
- **Docs Site**: Fumadocs or Mintlify (developer docs that look professional)
- **Monorepo**: Turborepo with pnpm workspaces

---

## Monorepo Structure

```
agentgate/
├── CLAUDE.md                    ← You are here
├── turbo.json
├── package.json
├── pnpm-workspace.yaml
│
├── packages/
│   ├── sdk/                     ← @agentgate/sdk (npm package)
│   │   ├── src/
│   │   │   ├── index.ts         ← Main export
│   │   │   ├── client.ts        ← AgentGate client class
│   │   │   ├── identity/
│   │   │   │   ├── index.ts
│   │   │   │   ├── create.ts    ← Create agent identity
│   │   │   │   ├── verify.ts    ← Verify agent identity
│   │   │   │   └── types.ts
│   │   │   ├── policy/
│   │   │   │   ├── index.ts
│   │   │   │   ├── engine.ts    ← Policy evaluation engine
│   │   │   │   ├── schema.ts    ← Policy definition schema
│   │   │   │   └── types.ts
│   │   │   ├── transact/
│   │   │   │   ├── index.ts
│   │   │   │   ├── router.ts    ← Routes to correct protocol
│   │   │   │   ├── execute.ts   ← Executes transaction
│   │   │   │   └── types.ts
│   │   │   ├── trust/
│   │   │   │   ├── index.ts
│   │   │   │   ├── score.ts     ← Trust score queries
│   │   │   │   └── types.ts
│   │   │   ├── adapters/
│   │   │   │   ├── index.ts
│   │   │   │   ├── stripe-acp.ts    ← Stripe ACP adapter
│   │   │   │   ├── x402.ts          ← Coinbase x402 adapter
│   │   │   │   ├── mock.ts          ← Mock adapter for testing
│   │   │   │   └── types.ts         ← Adapter interface
│   │   │   └── utils/
│   │   │       ├── errors.ts
│   │   │       ├── logger.ts
│   │   │       └── crypto.ts
│   │   ├── tsconfig.json
│   │   ├── package.json
│   │   └── README.md            ← THIS IS THE MOST IMPORTANT FILE
│   │
│   └── core/                    ← Shared types and constants
│       ├── src/
│       │   ├── types.ts         ← Shared type definitions
│       │   ├── constants.ts
│       │   └── protocols.ts     ← Protocol enum and metadata
│       └── package.json
│
├── apps/
│   ├── gateway/                 ← AgentGate Gateway API
│   │   ├── src/
│   │   │   ├── index.ts         ← Hono app entry
│   │   │   ├── routes/
│   │   │   │   ├── transact.ts  ← POST /v1/transact
│   │   │   │   ├── identity.ts  ← POST /v1/identity/register, GET /v1/identity/verify
│   │   │   │   ├── trust.ts     ← GET /v1/trust/:agentId
│   │   │   │   └── health.ts
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts      ← API key validation
│   │   │   │   ├── rateLimit.ts
│   │   │   │   └── audit.ts     ← Immutable audit logging
│   │   │   ├── services/
│   │   │   │   ├── identity.service.ts
│   │   │   │   ├── transaction.service.ts
│   │   │   │   ├── trust.service.ts
│   │   │   │   └── routing.service.ts
│   │   │   └── db/
│   │   │       ├── schema.ts    ← Drizzle ORM schema
│   │   │       └── migrations/
│   │   └── package.json
│   │
│   ├── docs/                    ← Documentation site
│   │   ├── content/
│   │   │   ├── quickstart.mdx
│   │   │   ├── concepts/
│   │   │   │   ├── identity.mdx
│   │   │   │   ├── policies.mdx
│   │   │   │   ├── trust.mdx
│   │   │   │   └── routing.mdx
│   │   │   ├── api-reference/
│   │   │   │   ├── transact.mdx
│   │   │   │   ├── identity.mdx
│   │   │   │   └── trust.mdx
│   │   │   └── guides/
│   │   │       ├── langchain.mdx
│   │   │       ├── crewai.mdx
│   │   │       └── sandbox.mdx
│   │   └── package.json
│   │
│   └── sandbox/                 ← Interactive sandbox/playground
│       ├── src/
│       │   ├── mock-merchant.ts ← Fake merchant that accepts agent txns
│       │   ├── mock-agent.ts    ← Example agent using the SDK
│       │   └── scenarios/       ← Pre-built demo scenarios
│       │       ├── shopping.ts
│       │       ├── booking.ts
│       │       └── subscription.ts
│       └── package.json
│
└── examples/
    ├── langchain-shopping-agent/ ← Full example: LangChain agent that shops
    │   ├── index.ts
    │   ├── README.md
    │   └── package.json
    ├── crewai-booking-agent/     ← Full example: CrewAI agent that books
    │   ├── index.ts
    │   ├── README.md
    │   └── package.json
    └── simple-purchase/          ← Minimal example (< 20 lines)
        ├── index.ts
        ├── README.md
        └── package.json
```

---

## Core SDK Interface (What Developers See)

This is the developer experience we're optimizing for. A developer should go from `npm install` to a working agent transaction in under 10 minutes.

```typescript
import { AgentGate } from '@agentgate/sdk';

// Initialize with developer API key
const gate = new AgentGate({
  apiKey: 'ag_dev_xxxx',        // Developer's API key
  environment: 'sandbox',       // 'sandbox' | 'production'
});

// 1. Register an agent identity
const agent = await gate.identity.register({
  name: 'shopping-assistant',
  owner: 'user_12345',          // The human this agent acts for
  capabilities: ['purchase', 'compare', 'subscribe'],
  policies: {
    maxTransactionAmount: 500,   // USD cents? No — USD dollars
    allowedCategories: ['electronics', 'books', 'groceries'],
    requireHumanApproval: {
      above: 100,                // Require human approval above $100
    },
    allowedMerchants: ['*'],     // Or specific merchant IDs
    dailySpendLimit: 1000,
    blockedMerchants: [],
  },
});

// 2. Execute a transaction
const txn = await gate.transact({
  agentId: agent.id,
  intent: 'purchase',
  item: {
    description: 'Sony WH-1000XM5 Headphones',
    amount: 278.00,
    currency: 'USD',
    merchantUrl: 'https://amazon.com/dp/B09XS7JWHH',
  },
  preferredProtocol: 'auto',    // 'auto' | 'stripe-acp' | 'x402' | 'mc-agent-pay'
  metadata: {
    reason: 'User requested noise-cancelling headphones under $300',
    comparisonData: { /* prices from other merchants */ },
  },
});

// txn.status: 'completed' | 'pending_approval' | 'rejected' | 'failed'
// txn.protocol: 'stripe-acp' (which protocol was actually used)
// txn.receipt: { ... }
// txn.trustImpact: +2 (how this affected the agent's trust score)

// 3. Check trust score
const trust = await gate.trust.score(agent.id);
// trust.score: 87
// trust.totalTransactions: 142
// trust.successRate: 0.98
// trust.level: 'verified' | 'trusted' | 'established' | 'new'
```

---

## Database Schema (Drizzle ORM + Supabase/Postgres)

```typescript
// Key tables — implement with Drizzle ORM

// developers — the humans/companies using our SDK
// Fields: id, apiKey, email, plan (free/pro/enterprise), createdAt

// agents — AI agents registered through the SDK
// Fields: id, developerId, name, ownerUserId, capabilities[], policies (jsonb), 
//         trustScore, totalTransactions, successRate, status, createdAt

// transactions — every transaction routed through the gateway
// Fields: id, agentId, developerId, intent, amount, currency, merchantUrl,
//         protocol (which rail was used), status, receiptData (jsonb),
//         policyCheckResult (jsonb), humanApprovalRequired, humanApprovalStatus,
//         createdAt, completedAt

// audit_logs — immutable append-only log (this is critical for trust)
// Fields: id, agentId, transactionId, eventType, eventData (jsonb),
//         signature (cryptographic hash), previousHash (chain), createdAt

// trust_events — granular events that affect trust scores
// Fields: id, agentId, eventType (txn_success, txn_fail, dispute, verification),
//         scoreChange, newScore, metadata (jsonb), createdAt
```

---

## API Endpoints (Gateway)

```
POST   /v1/identity/register     — Register a new agent identity
GET    /v1/identity/:agentId     — Get agent identity and status
POST   /v1/identity/verify       — Verify an agent's identity (for merchants)

POST   /v1/transact              — Execute a transaction
GET    /v1/transact/:txnId       — Get transaction status
POST   /v1/transact/:txnId/approve — Human approval for flagged txns

GET    /v1/trust/:agentId        — Get agent trust score and history
GET    /v1/trust/:agentId/report — Full trust report (for merchants)

GET    /v1/protocols              — List supported protocols and status
GET    /v1/health                 — Health check
```

---

## Protocol Adapter Interface

Every payment protocol gets an adapter that implements this interface:

```typescript
interface ProtocolAdapter {
  name: string;                          // 'stripe-acp' | 'x402' | 'mc-agent-pay' | 'google-a2a'
  isAvailable(): Promise<boolean>;       // Is this protocol operational?
  
  supportsIntent(intent: TransactionIntent): boolean;  // Can this protocol handle this type?
  
  estimateFee(txn: TransactionRequest): Promise<FeeEstimate>;  // What will this cost?
  
  execute(txn: ValidatedTransaction): Promise<TransactionResult>;  // Do the transaction
  
  verify(receipt: TransactionReceipt): Promise<VerificationResult>;  // Verify a past txn
}
```

The router picks the best adapter based on:
1. What the merchant supports
2. Developer's preferred protocol (or 'auto')
3. Lowest fees
4. Highest reliability for this transaction type

---

## Build Order (Follow This Sequence)

### Phase 1: Foundation (Build First)
1. Monorepo setup (Turborepo + pnpm)
2. `@agentgate/core` — shared types, constants, protocol definitions
3. `@agentgate/sdk` — client class with the interface shown above
4. Mock adapter — so everything works locally without real payment rails
5. Sandbox app — mock merchant + mock agent for testing

### Phase 2: Gateway API
6. Hono API with basic routes
7. Supabase database + Drizzle schema + migrations
8. Identity registration and verification endpoints
9. Transaction routing with mock adapter
10. Audit logging (append-only with hash chain)
11. Trust score calculation service

### Phase 3: First Real Adapter
12. Stripe ACP adapter (Stripe is most accessible, best docs)
13. End-to-end test: real agent → SDK → gateway → Stripe ACP → mock merchant

### Phase 4: Docs & Examples
14. Documentation site (quickstart, concepts, API reference)
15. LangChain integration example
16. Simple purchase example (the "Hello World" — must be < 20 lines)
17. README.md for the SDK (the single most important piece of content)

### Phase 5: Distribution
18. Publish to npm
19. Submit LangChain integration PR
20. Write "How Agent Payments Work in 2026" blog post

---

## Design Principles

1. **10-minute quickstart** — A developer must be able to go from nothing to a working sandbox transaction in under 10 minutes. If it takes longer, simplify.

2. **Sensible defaults, full control** — Everything works out of the box but every behavior is overridable. Default to 'auto' protocol routing but let devs pin a specific protocol.

3. **Trust is the product** — The trust scoring system is what makes us a toll booth, not just a router. Without trust scores, we're a convenience library. With them, we're infrastructure merchants depend on.

4. **Append-only audit trail** — Every action is logged with a cryptographic hash chain. This isn't just a feature, it's what makes us NIST-compliant and enterprise-ready.

5. **Open source SDK, hosted gateway** — The SDK is MIT licensed and free. The gateway API is the monetization layer (free tier: 1000 txns/month, pro: $99/month, enterprise: custom).

6. **Protocol-agnostic by design** — We never bet on one protocol winning. We're the Switzerland layer. New protocol? New adapter. The interface stays the same for developers.

---

## Naming Considerations

"AgentGate" is a working name. Other options to consider:
- Tollway
- AgentRail
- Passkey (might conflict)
- Conduit
- GateKeep

Pick whatever — shipping matters more than naming.

---

## Key Reference Material

Before building protocol adapters, read these specs:
- Stripe Agentic Commerce Protocol: https://docs.stripe.com (search for ACP)
- Coinbase x402: https://github.com/coinbase/x402
- Google Agent-to-Agent (A2A): https://github.com/google/A2A
- ERC-8004 (Agent Identity NFT): Search Ethereum EIPs
- NIST AI Agent Standards Initiative: https://www.nist.gov/artificial-intelligence/ai-agent-standards-initiative
- Mastercard Agent Pay: Search Mastercard developer docs
