import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHmac } from 'node:crypto';
import { AgentGate } from '../src/client.js';
import { StripeACPAdapter, StripeACPError } from '../src/adapters/stripe-acp.js';
import { MockAdapter } from '../src/adapters/mock.js';

// ── Mock ACP Seller Server ─────────────────────────────────
// Implements the 5 ACP endpoints per spec 2026-01-30:
//   POST   /acp/checkouts            — Create checkout
//   GET    /acp/checkouts/:id        — Retrieve checkout
//   PUT    /acp/checkouts/:id        — Update checkout
//   POST   /acp/checkouts/:id/complete — Complete with payment
//   POST   /acp/checkouts/:id/cancel   — Cancel checkout

const sessions: Map<string, any> = new Map();
let sptCounter = 0;

function createMockSellerServer(): Server {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url!, `http://localhost`);
    const path = url.pathname;
    let body = '';

    await new Promise<void>((resolve) => {
      req.on('data', (chunk) => (body += chunk));
      req.on('end', resolve);
    });

    res.setHeader('Content-Type', 'application/json');

    // ── POST /acp/checkouts — Create a new checkout session ──
    if (req.method === 'POST' && path === '/acp/checkouts') {
      const data = JSON.parse(body);
      const sessionId = `cs_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const item = data.items?.[0] ?? { id: 'unknown', quantity: 1 };

      const session = {
        id: sessionId,
        status: 'ready_for_payment' as const,
        line_items: [
          {
            id: `li_${sessionId}`,
            item: { id: item.id, quantity: item.quantity },
            base_amount: 27800,
            discount: 0,
            subtotal: 27800,
            tax: 2224,
            total: 30024,
          },
        ],
        totals: [
          { type: 'subtotal', display_text: 'Subtotal', amount: 27800 },
          { type: 'shipping', display_text: 'Standard Shipping', amount: 599 },
          { type: 'tax', display_text: 'Tax (8%)', amount: 2224 },
          { type: 'discount', display_text: 'New Customer', amount: -500 },
          { type: 'total', display_text: 'Total', amount: 30147 },
        ],
        fulfillment_options: [
          {
            id: 'ship_standard',
            label: 'Standard Shipping (5-7 days)',
            amount: 599,
            estimated_delivery: '2026-03-30',
          },
          {
            id: 'ship_express',
            label: 'Express Shipping (1-2 days)',
            amount: 1499,
            estimated_delivery: '2026-03-25',
          },
        ],
        payment_provider: {
          provider: 'stripe',
          supported_payment_methods: ['card', 'shared_payment_token'],
        },
        messages: [],
        links: [
          { url: `http://localhost/products/${item.id}`, rel: 'product', type: 'text/html' },
        ],
      };
      sessions.set(sessionId, session);
      res.writeHead(201);
      res.end(JSON.stringify(session));
      return;
    }

    // ── POST /acp/checkouts/:id/complete — Complete with payment ──
    const completeMatch = path.match(/^\/acp\/checkouts\/([^/]+)\/complete$/);
    if (req.method === 'POST' && completeMatch) {
      const sessionId = completeMatch[1];
      const session = sessions.get(sessionId);
      if (!session) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Checkout session not found' }));
        return;
      }

      const data = JSON.parse(body);
      if (!data.payment_data?.token || !data.payment_data?.provider) {
        res.writeHead(400);
        res.end(JSON.stringify({
          error: 'Missing payment_data.token or payment_data.provider',
          messages: [{ type: 'error', content: 'Payment data is required', code: 'missing_payment' }],
        }));
        return;
      }

      session.status = 'completed';
      session.order = {
        id: `order_${Date.now()}`,
        checkout_session_id: sessionId,
        status: 'confirmed',
        permalink_url: `http://localhost/orders/${sessionId}`,
      };
      session.messages = [{ type: 'info', content: 'Payment successful. Order confirmed.' }];
      res.writeHead(200);
      res.end(JSON.stringify(session));
      return;
    }

    // ── POST /acp/checkouts/:id/cancel — Cancel checkout ──
    const cancelMatch = path.match(/^\/acp\/checkouts\/([^/]+)\/cancel$/);
    if (req.method === 'POST' && cancelMatch) {
      const sessionId = cancelMatch[1];
      const session = sessions.get(sessionId);
      if (!session) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Checkout session not found' }));
        return;
      }
      if (session.status === 'completed') {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Cannot cancel a completed checkout' }));
        return;
      }
      session.status = 'canceled';
      session.messages = [{ type: 'info', content: 'Checkout canceled.' }];
      res.writeHead(200);
      res.end(JSON.stringify(session));
      return;
    }

    // ── PUT /acp/checkouts/:id — Update checkout ──
    const updateMatch = path.match(/^\/acp\/checkouts\/([^/]+)$/);
    if (req.method === 'PUT' && updateMatch) {
      const sessionId = updateMatch[1];
      const session = sessions.get(sessionId);
      if (!session) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Checkout session not found' }));
        return;
      }
      const data = JSON.parse(body);
      if (data.buyer) session.buyer = data.buyer;
      if (data.shipping_address) session.shipping_address = data.shipping_address;
      if (data.selected_fulfillment_option) {
        session.selected_fulfillment_option = data.selected_fulfillment_option;
        // Update shipping total based on selection
        const option = session.fulfillment_options?.find(
          (o: any) => o.id === data.selected_fulfillment_option,
        );
        if (option) {
          const shippingTotal = session.totals.find((t: any) => t.type === 'shipping');
          if (shippingTotal) shippingTotal.amount = option.amount;
        }
      }
      session.status = 'ready_for_payment';
      res.writeHead(200);
      res.end(JSON.stringify(session));
      return;
    }

    // ── GET /acp/checkouts/:id — Retrieve checkout ──
    const getMatch = path.match(/^\/acp\/checkouts\/([^/]+)$/);
    if (req.method === 'GET' && getMatch) {
      const sessionId = getMatch[1];
      const session = sessions.get(sessionId);
      if (!session) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Checkout session not found' }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify(session));
      return;
    }

    // ── Mock Stripe SPT Endpoint ──
    // POST /v1/test_helpers/shared_payment/granted_tokens
    if (req.method === 'POST' && path === '/v1/test_helpers/shared_payment/granted_tokens') {
      sptCounter++;
      const spt = {
        id: `spt_test_${sptCounter}_${Date.now()}`,
        object: 'shared_payment_token',
        created: Math.floor(Date.now() / 1000),
        usage_limits: {
          currency: 'usd',
          max_amount: 30147,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      };
      res.writeHead(200);
      res.end(JSON.stringify(spt));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found', path, method: req.method }));
  });
}

// ── Helper: build agent fixture ─────────────────────────────
function makeAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'agent_test_123',
    developerId: 'dev_test',
    name: 'test-agent',
    owner: 'user_test',
    capabilities: ['purchase'] as string[],
    policies: {
      maxTransactionAmount: 500,
      allowedCategories: [] as string[],
      allowedMerchants: ['*'],
      dailySpendLimit: 1000,
      blockedMerchants: [] as string[],
    },
    trustScore: 50,
    totalTransactions: 0,
    successRate: 1.0,
    status: 'active' as const,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────

describe('Stripe ACP Adapter', () => {
  let server: Server;
  let port: number;
  let baseUrl: string;

  before(async () => {
    server = createMockSellerServer();
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

  it('should report unavailable with a malformed key', async () => {
    const adapter = new StripeACPAdapter({
      stripeSecretKey: 'not-a-stripe-key',
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
      agent: makeAgent(),
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
    const adapter = new StripeACPAdapter({
      stripeSecretKey: 'sk_test_fake123',
      stripeBaseUrl: baseUrl,
    });

    // Execute a transaction to get a valid receipt
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
      agent: makeAgent({ id: 'agent_verify_test', name: 'verify-agent' }),
      policyCheck: { allowed: true, violations: [] },
    });

    assert.ok(result.receipt);

    // Verify the receipt
    const verification = await adapter.verify(result.receipt!);
    assert.equal(verification.valid, true);
    assert.equal(verification.protocol, 'stripe-acp');
    assert.ok(verification.details?.sessionId);
    assert.equal(verification.details?.status, 'completed');
    assert.ok(verification.details?.orderId);
  });

  it('should return invalid verification for wrong protocol', async () => {
    const adapter = new StripeACPAdapter({
      stripeSecretKey: 'sk_test_fake123',
      stripeBaseUrl: baseUrl,
    });

    const verification = await adapter.verify({
      transactionId: 'txn_fake',
      protocol: 'mock',
      amount: 10,
      currency: 'USD',
      merchantUrl: 'https://example.com',
      timestamp: new Date().toISOString(),
    });
    assert.equal(verification.valid, false);
  });

  it('should cancel a checkout session', async () => {
    const adapter = new StripeACPAdapter({
      stripeSecretKey: 'sk_test_fake123',
      stripeBaseUrl: baseUrl,
    });

    // Create a checkout first
    const sellerBase = `${baseUrl}/acp`;
    const session = await adapter.createCheckout(sellerBase, {
      agentId: 'agent_cancel_test',
      intent: 'purchase',
      item: {
        description: 'Cancel Me',
        amount: 19.99,
        currency: 'USD',
        merchantUrl: `${baseUrl}/products/cancel-test`,
      },
      preferredProtocol: 'stripe-acp',
    });
    assert.equal(session.status, 'ready_for_payment');

    // Cancel it
    const canceled = await adapter.cancelCheckout(sellerBase, session.id, 'Changed my mind');
    assert.equal(canceled.status, 'canceled');
  });

  it('should verify webhook signatures with HMAC', () => {
    const secret = 'whsec_test_secret_123';
    const adapter = new StripeACPAdapter({
      stripeSecretKey: 'sk_test_fake123',
      webhookSecret: secret,
    });

    const payload = JSON.stringify({ type: 'checkout.completed', data: { id: 'cs_123' } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const hmac = createHmac('sha256', secret)
      .update(`${timestamp}.${payload}`)
      .digest('hex');
    const signature = `t=${timestamp},v1=${hmac}`;

    const result = adapter.verifyWebhookSignature(payload, signature);
    assert.equal((result as any).type, 'checkout.completed');
  });

  it('should reject invalid webhook signatures', () => {
    const adapter = new StripeACPAdapter({
      stripeSecretKey: 'sk_test_fake123',
      webhookSecret: 'whsec_test_secret_123',
    });

    const payload = '{"type":"checkout.completed"}';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `t=${timestamp},v1=invalid_hmac_value`;

    assert.throws(
      () => adapter.verifyWebhookSignature(payload, signature),
      (err: any) => err instanceof StripeACPError && err.step === 'webhook',
    );
  });

  it('should reject expired webhook timestamps', () => {
    const secret = 'whsec_test_secret_123';
    const adapter = new StripeACPAdapter({
      stripeSecretKey: 'sk_test_fake123',
      webhookSecret: secret,
    });

    const payload = '{"type":"checkout.completed"}';
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 600); // 10 min old
    const hmac = createHmac('sha256', secret)
      .update(`${oldTimestamp}.${payload}`)
      .digest('hex');
    const signature = `t=${oldTimestamp},v1=${hmac}`;

    assert.throws(
      () => adapter.verifyWebhookSignature(payload, signature),
      (err: any) => err instanceof StripeACPError && err.step === 'webhook',
    );
  });

  it('should include fulfillment options in checkout response', async () => {
    const adapter = new StripeACPAdapter({
      stripeSecretKey: 'sk_test_fake123',
      stripeBaseUrl: baseUrl,
    });

    const sellerBase = `${baseUrl}/acp`;
    const session = await adapter.createCheckout(sellerBase, {
      agentId: 'agent_fulfill_test',
      intent: 'purchase',
      item: {
        description: 'Shipping Test',
        amount: 50.00,
        currency: 'USD',
        merchantUrl: `${baseUrl}/products/ship-test`,
      },
      preferredProtocol: 'stripe-acp',
    });

    assert.ok(session.fulfillment_options);
    assert.ok(session.fulfillment_options!.length >= 2);
    assert.ok(session.fulfillment_options![0].id);
    assert.ok(session.fulfillment_options![0].label);
    assert.ok(typeof session.fulfillment_options![0].amount === 'number');
  });
});

describe('AgentGate SDK with Stripe ACP', () => {
  let server: Server;
  let port: number;
  let baseUrl: string;

  before(async () => {
    server = createMockSellerServer();
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
