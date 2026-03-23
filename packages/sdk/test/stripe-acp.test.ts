import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { AgentGate } from '../src/client.js';
import { StripeACPAdapter } from '../src/adapters/stripe-acp.js';
import { MockAdapter } from '../src/adapters/mock.js';

// ── Mock ACP Merchant Server ────────────────────────────────
// Simulates a merchant implementing the ACP checkout endpoints

const sessions: Map<string, any> = new Map();
let sptCounter = 0;

function createMockMerchantServer(): Server {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url!, `http://localhost`);
    const path = url.pathname;
    let body = '';

    await new Promise<void>((resolve) => {
      req.on('data', (chunk) => (body += chunk));
      req.on('end', resolve);
    });

    res.setHeader('Content-Type', 'application/json');

    // POST /acp/checkout_sessions — Create checkout
    if (req.method === 'POST' && path === '/acp/checkout_sessions') {
      const data = JSON.parse(body);
      const sessionId = `cs_test_${Date.now()}`;
      const session = {
        id: sessionId,
        status: 'ready_for_payment',
        line_items: [
          {
            id: 'li_1',
            item: data.items[0],
            base_amount: 27800,
            discount: 0,
            subtotal: 27800,
            tax: 2224,
            total: 30024,
          },
        ],
        totals: [
          { type: 'subtotal', display_text: 'Subtotal', amount: 27800 },
          { type: 'tax', display_text: 'Tax', amount: 2224 },
          { type: 'total', display_text: 'Total', amount: 30024 },
        ],
        payment_provider: { provider: 'stripe', supported_payment_methods: ['card'] },
        messages: [],
      };
      sessions.set(sessionId, session);
      res.writeHead(201);
      res.end(JSON.stringify(session));
      return;
    }

    // POST /acp/checkout_sessions/:id — Update checkout
    const updateMatch = path.match(/^\/acp\/checkout_sessions\/([^/]+)$/);
    if (req.method === 'POST' && updateMatch && !path.includes('/complete') && !path.includes('/cancel')) {
      const sessionId = updateMatch[1];
      const session = sessions.get(sessionId);
      if (!session) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
      }
      const data = JSON.parse(body);
      if (data.buyer) session.buyer = data.buyer;
      session.status = 'ready_for_payment';
      res.writeHead(200);
      res.end(JSON.stringify(session));
      return;
    }

    // POST /acp/checkout_sessions/:id/complete — Complete checkout
    const completeMatch = path.match(/^\/acp\/checkout_sessions\/([^/]+)\/complete$/);
    if (req.method === 'POST' && completeMatch) {
      const sessionId = completeMatch[1];
      const session = sessions.get(sessionId);
      if (!session) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
      }
      session.status = 'completed';
      session.order = {
        id: `order_${Date.now()}`,
        checkout_session_id: sessionId,
        permalink_url: `http://localhost/orders/${sessionId}`,
      };
      res.writeHead(200);
      res.end(JSON.stringify(session));
      return;
    }

    // GET /acp/checkout_sessions/:id — Retrieve checkout
    const getMatch = path.match(/^\/acp\/checkout_sessions\/([^/]+)$/);
    if (req.method === 'GET' && getMatch) {
      const sessionId = getMatch[1];
      const session = sessions.get(sessionId);
      if (!session) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify(session));
      return;
    }

    // Mock Stripe SPT endpoint
    // POST /v1/test_helpers/shared_payment/granted_tokens
    if (req.method === 'POST' && path === '/v1/test_helpers/shared_payment/granted_tokens') {
      sptCounter++;
      const spt = {
        id: `spt_test_${sptCounter}`,
        created: Math.floor(Date.now() / 1000),
        usage_limits: {
          currency: 'usd',
          max_amount: 30024,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      };
      res.writeHead(200);
      res.end(JSON.stringify(spt));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });
}

// ── Tests ───────────────────────────────────────────────────

describe('Stripe ACP Adapter', () => {
  let server: Server;
  let port: number;
  let baseUrl: string;

  before(async () => {
    server = createMockMerchantServer();
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address() as { port: number };
        port = addr.port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  after(() => {
    server.close();
  });

  it('should report availability with a valid test key', async () => {
    const adapter = new StripeACPAdapter({
      stripeSecretKey: 'sk_test_fake123',
      stripeBaseUrl: baseUrl,
    });
    assert.equal(await adapter.isAvailable(), true);
  });

  it('should report unavailable with no key', async () => {
    const adapter = new StripeACPAdapter({
      stripeSecretKey: '',
      stripeBaseUrl: baseUrl,
    });
    assert.equal(await adapter.isAvailable(), false);
  });

  it('should support purchase and subscribe intents', () => {
    const adapter = new StripeACPAdapter({
      stripeSecretKey: 'sk_test_fake123',
    });
    assert.equal(adapter.supportsIntent('purchase'), true);
    assert.equal(adapter.supportsIntent('subscribe'), true);
    assert.equal(adapter.supportsIntent('compare'), false);
    assert.equal(adapter.supportsIntent('refund'), false);
  });

  it('should estimate fees correctly (2.9% + $0.30)', async () => {
    const adapter = new StripeACPAdapter({
      stripeSecretKey: 'sk_test_fake123',
    });
    const fee = await adapter.estimateFee({
      agentId: 'agent_test',
      intent: 'purchase',
      item: { description: 'Test', amount: 100, currency: 'USD', merchantUrl: 'https://example.com' },
      preferredProtocol: 'stripe-acp',
    });
    assert.equal(fee.protocol, 'stripe-acp');
    assert.equal(fee.fixedFee, 0.30);
    assert.equal(fee.percentageFee, 0.029);
    // 100 * 0.029 + 0.30 = 3.20, total = 103.20
    assert.ok(Math.abs(fee.estimatedTotal - 103.20) < 0.01);
  });

  it('should execute the full ACP handshake: create → update → SPT → complete', async () => {
    const adapter = new StripeACPAdapter({
      stripeSecretKey: 'sk_test_fake123',
      stripeBaseUrl: baseUrl,
    });

    const result = await adapter.execute({
      request: {
        agentId: 'agent_test_123',
        intent: 'purchase',
        item: {
          description: 'Sony WH-1000XM5 Headphones',
          amount: 278.00,
          currency: 'USD',
          merchantUrl: `${baseUrl}/products/headphones`,
        },
        preferredProtocol: 'stripe-acp',
      },
      agent: {
        id: 'agent_test_123',
        developerId: 'dev_test',
        name: 'test-agent',
        owner: 'user_test',
        capabilities: ['purchase'],
        policies: {
          maxTransactionAmount: 500,
          allowedCategories: [],
          allowedMerchants: ['*'],
          dailySpendLimit: 1000,
          blockedMerchants: [],
        },
        trustScore: 50,
        totalTransactions: 0,
        successRate: 1.0,
        status: 'active',
        createdAt: new Date().toISOString(),
      },
      policyCheck: { allowed: true, violations: [] },
    });

    assert.equal(result.status, 'completed');
    assert.equal(result.protocol, 'stripe-acp');
    assert.ok(result.receipt);
    assert.equal(result.receipt!.protocol, 'stripe-acp');
    assert.equal(result.receipt!.amount, 278.00);
    assert.ok(result.receipt!.protocolData?.checkoutSessionId);
    assert.ok(result.receipt!.protocolData?.orderId);
    assert.ok(result.receipt!.protocolData?.orderUrl);
    assert.ok(result.receipt!.protocolData?.paymentTokenId);
    assert.equal(result.trustImpact, 2);
  });

  it('should verify a completed transaction receipt', async () => {
    // First execute a transaction to get a valid receipt
    const adapter = new StripeACPAdapter({
      stripeSecretKey: 'sk_test_fake123',
      stripeBaseUrl: baseUrl,
    });

    const result = await adapter.execute({
      request: {
        agentId: 'agent_verify_test',
        intent: 'purchase',
        item: {
          description: 'Test Item',
          amount: 42.99,
          currency: 'USD',
          merchantUrl: `${baseUrl}/products/book`,
        },
        preferredProtocol: 'stripe-acp',
      },
      agent: {
        id: 'agent_verify_test',
        developerId: 'dev_test',
        name: 'verify-agent',
        owner: 'user_test',
        capabilities: ['purchase'],
        policies: {
          maxTransactionAmount: 500,
          allowedCategories: [],
          allowedMerchants: ['*'],
          dailySpendLimit: 1000,
          blockedMerchants: [],
        },
        trustScore: 50,
        totalTransactions: 0,
        successRate: 1.0,
        status: 'active',
        createdAt: new Date().toISOString(),
      },
      policyCheck: { allowed: true, violations: [] },
    });

    assert.ok(result.receipt);

    // Now verify the receipt
    const verification = await adapter.verify(result.receipt!);
    assert.equal(verification.valid, true);
    assert.equal(verification.protocol, 'stripe-acp');
    assert.ok(verification.details?.sessionId);
    assert.equal(verification.details?.status, 'completed');
  });
});

describe('AgentGate SDK with Stripe ACP', () => {
  let server: Server;
  let port: number;
  let baseUrl: string;

  before(async () => {
    server = createMockMerchantServer();
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address() as { port: number };
        port = addr.port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  after(() => {
    server.close();
  });

  it('should route to Stripe ACP when preferredProtocol is stripe-acp', async () => {
    const gate = new AgentGate({
      apiKey: 'ag_dev_test',
      environment: 'sandbox',
      adapters: [
        new MockAdapter(),
        new StripeACPAdapter({
          stripeSecretKey: 'sk_test_fake123',
          stripeBaseUrl: baseUrl,
        }),
      ],
    });

    const agent = await gate.identity.register({
      name: 'stripe-test-agent',
      owner: 'user_stripe',
      capabilities: ['purchase'],
      policies: {
        maxTransactionAmount: 500,
        allowedCategories: [],
        allowedMerchants: ['*'],
        dailySpendLimit: 1000,
        blockedMerchants: [],
      },
    });

    const txn = await gate.transact({
      agentId: agent.id,
      intent: 'purchase',
      item: {
        description: 'Sony Headphones',
        amount: 49.99,
        currency: 'USD',
        merchantUrl: `${baseUrl}/products/headphones`,
      },
      preferredProtocol: 'stripe-acp',
    });

    assert.equal(txn.status, 'completed');
    assert.equal(txn.protocol, 'stripe-acp');
    assert.ok(txn.receipt);
    assert.equal(txn.receipt!.protocol, 'stripe-acp');
  });

  it('should auto-select mock adapter when Stripe ACP is unavailable', async () => {
    const gate = new AgentGate({
      apiKey: 'ag_dev_test',
      environment: 'sandbox',
      adapters: [
        new MockAdapter(),
        new StripeACPAdapter({
          stripeSecretKey: '', // No key — unavailable
          stripeBaseUrl: baseUrl,
        }),
      ],
    });

    const agent = await gate.identity.register({
      name: 'fallback-test-agent',
      owner: 'user_fallback',
      capabilities: ['purchase'],
      policies: {
        maxTransactionAmount: 500,
        allowedCategories: [],
        allowedMerchants: ['*'],
        dailySpendLimit: 1000,
        blockedMerchants: [],
      },
    });

    const txn = await gate.transact({
      agentId: agent.id,
      intent: 'purchase',
      item: {
        description: 'Test Item',
        amount: 25.00,
        currency: 'USD',
        merchantUrl: `${baseUrl}/products/test`,
      },
      preferredProtocol: 'auto',
    });

    assert.equal(txn.status, 'completed');
    assert.equal(txn.protocol, 'mock'); // Falls back to mock
  });

  it('should list both protocols when both are registered', () => {
    const gate = new AgentGate({
      apiKey: 'ag_dev_test',
      environment: 'sandbox',
      adapters: [
        new MockAdapter(),
        new StripeACPAdapter({
          stripeSecretKey: 'sk_test_fake123',
          stripeBaseUrl: baseUrl,
        }),
      ],
    });

    const protocols = gate.listProtocols();
    assert.ok(protocols.includes('mock'));
    assert.ok(protocols.includes('stripe-acp'));
  });

  it('should demonstrate the full end-to-end flow: register → transact → trust', async () => {
    const gate = new AgentGate({
      apiKey: 'ag_dev_test',
      environment: 'sandbox',
      adapters: [
        new MockAdapter(),
        new StripeACPAdapter({
          stripeSecretKey: 'sk_test_fake123',
          stripeBaseUrl: baseUrl,
        }),
      ],
    });

    // 1. Register agent
    const agent = await gate.identity.register({
      name: 'e2e-shopping-agent',
      owner: 'user_e2e',
      capabilities: ['purchase', 'compare'],
      policies: {
        maxTransactionAmount: 500,
        allowedCategories: ['electronics', 'books'],
        requireHumanApproval: { above: 200 },
        allowedMerchants: ['*'],
        dailySpendLimit: 1000,
        blockedMerchants: [],
      },
    });
    assert.equal(agent.status, 'active');
    assert.equal(agent.trustScore, 50);

    // 2. Execute transaction via Stripe ACP (under approval threshold)
    const txn = await gate.transact({
      agentId: agent.id,
      intent: 'purchase',
      item: {
        description: 'Programming Book',
        amount: 42.99,
        currency: 'USD',
        merchantUrl: `${baseUrl}/products/book`,
        category: 'books',
      },
      preferredProtocol: 'stripe-acp',
      metadata: { reason: 'User wants a programming book' },
    });
    assert.equal(txn.status, 'completed');
    assert.equal(txn.protocol, 'stripe-acp');

    // 3. Check trust score increased
    const trust = await gate.trust.score(agent.id);
    assert.equal(trust.score, 52); // 50 + 2
    assert.equal(trust.totalTransactions, 1);
    assert.equal(trust.level, 'established');

    // 4. Verify identity
    const verification = gate.identity.verify(agent.id);
    assert.equal(verification.valid, true);
  });
});
