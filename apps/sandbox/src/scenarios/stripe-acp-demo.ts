/**
 * Stripe ACP Demo — Full Agentic Commerce Protocol handshake
 *
 * Spins up a mock ACP-compatible seller on localhost:3400, then walks
 * through every step of the ACP flow so you can see the handshake:
 *
 *   1. POST   /acp/checkouts              — Create checkout session
 *   2. PUT    /acp/checkouts/:id          — Update with buyer + shipping
 *   3. POST   /v1/.../granted_tokens      — Provision SharedPaymentToken
 *   4. POST   /acp/checkouts/:id/complete — Complete with SPT
 *   5. GET    /acp/checkouts/:id          — Verify final state
 *   6. POST   /acp/checkouts/:id/cancel   — Cancel flow (separate session)
 *
 * Run:  pnpm --filter @agentgate/sandbox demo:acp
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { AgentGate, StripeACPAdapter } from '@agentgate/sdk';

// ── Formatting helpers ──────────────────────────────────────

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const MAGENTA = '\x1b[35m';

function header(text: string) {
  console.log();
  console.log(`${BOLD}${CYAN}${'─'.repeat(60)}${RESET}`);
  console.log(`${BOLD}${CYAN}  ${text}${RESET}`);
  console.log(`${BOLD}${CYAN}${'─'.repeat(60)}${RESET}`);
}

function step(n: number, method: string, path: string, description: string) {
  console.log();
  console.log(`${BOLD}${YELLOW}  Step ${n}${RESET}  ${BOLD}${method}${RESET} ${DIM}${path}${RESET}`);
  console.log(`${DIM}  ${description}${RESET}`);
}

function json(label: string, data: unknown) {
  console.log(`  ${MAGENTA}${label}:${RESET}`);
  const lines = JSON.stringify(data, null, 2).split('\n');
  for (const line of lines) {
    console.log(`    ${DIM}${line}${RESET}`);
  }
}

function ok(msg: string) {
  console.log(`  ${GREEN}✔${RESET} ${msg}`);
}

function fail(msg: string) {
  console.log(`  ${RED}✖${RESET} ${msg}`);
}

function info(msg: string) {
  console.log(`  ${DIM}${msg}${RESET}`);
}

// ── Product Catalog ─────────────────────────────────────────

interface CatalogProduct {
  id: string;
  name: string;
  base_price: number; // cents
  category: string;
  in_stock: boolean;
  image_url: string;
}

const CATALOG: CatalogProduct[] = [
  {
    id: 'prod_xm5',
    name: 'Sony WH-1000XM5 Wireless Headphones',
    base_price: 27800,
    category: 'electronics',
    in_stock: true,
    image_url: 'https://mock-seller.agentgate.dev/images/xm5.jpg',
  },
  {
    id: 'prod_kindle',
    name: 'Kindle Paperwhite (16GB)',
    base_price: 14999,
    category: 'electronics',
    in_stock: true,
    image_url: 'https://mock-seller.agentgate.dev/images/kindle.jpg',
  },
  {
    id: 'prod_coffee',
    name: 'Counter Culture Hologram Blend (2lb)',
    base_price: 3200,
    category: 'groceries',
    in_stock: true,
    image_url: 'https://mock-seller.agentgate.dev/images/coffee.jpg',
  },
];

// ── Mock ACP Seller Server ──────────────────────────────────

interface CheckoutSession {
  id: string;
  status: string;
  buyer?: { name: string; email?: string; phone?: string };
  line_items: any[];
  totals: any[];
  fulfillment_options: any[];
  selected_fulfillment_option?: string;
  shipping_address?: any;
  payment_provider: any;
  order?: any;
  messages: any[];
  links: any[];
  created_at: string;
  updated_at: string;
}

const sessions = new Map<string, CheckoutSession>();
let sessionSeq = 0;
let sptSeq = 0;
let orderSeq = 0;

function buildCheckoutSession(items: { id: string; quantity: number }[]): CheckoutSession {
  sessionSeq++;
  const sessionId = `cs_acp_demo_${String(sessionSeq).padStart(4, '0')}`;
  const now = new Date().toISOString();

  // Look up products from catalog
  const lineItems = items.map((reqItem, idx) => {
    const catalogProduct = CATALOG.find(p => p.id === reqItem.id);
    const basePrice = catalogProduct?.base_price ?? 9999;
    const qty = reqItem.quantity ?? 1;
    const subtotal = basePrice * qty;
    const tax = Math.round(subtotal * 0.0875); // 8.75% tax

    return {
      id: `li_${sessionId}_${idx}`,
      item: {
        id: reqItem.id,
        quantity: qty,
        ...(catalogProduct ? { display_name: catalogProduct.name, image_url: catalogProduct.image_url } : {}),
      },
      base_amount: basePrice * qty,
      discount: 0,
      subtotal,
      tax,
      total: subtotal + tax,
    };
  });

  const subtotalAmount = lineItems.reduce((s, li) => s + li.subtotal, 0);
  const taxAmount = lineItems.reduce((s, li) => s + li.tax, 0);
  const shippingAmount = 599; // default standard shipping

  return {
    id: sessionId,
    status: 'not_ready_for_payment',
    line_items: lineItems,
    totals: [
      { type: 'subtotal', display_text: 'Subtotal', amount: subtotalAmount },
      { type: 'shipping', display_text: 'Standard Shipping', amount: shippingAmount },
      { type: 'tax', display_text: 'Tax (8.75%)', amount: taxAmount },
      { type: 'total', display_text: 'Order Total', amount: subtotalAmount + shippingAmount + taxAmount },
    ],
    fulfillment_options: [
      {
        id: 'ship_standard',
        label: 'Standard Shipping (5–7 business days)',
        amount: 599,
        estimated_delivery: futureDate(7),
      },
      {
        id: 'ship_express',
        label: 'Express Shipping (1–2 business days)',
        amount: 1499,
        estimated_delivery: futureDate(2),
      },
      {
        id: 'ship_overnight',
        label: 'Overnight Shipping',
        amount: 2999,
        estimated_delivery: futureDate(1),
      },
    ],
    payment_provider: {
      provider: 'stripe',
      supported_payment_methods: ['card', 'shared_payment_token'],
    },
    messages: [
      { type: 'info', content: 'Items are in stock and ready to ship.' },
    ],
    links: [
      { url: 'https://mock-seller.agentgate.dev/returns', rel: 'return_policy', type: 'text/html' },
      { url: 'https://mock-seller.agentgate.dev/terms', rel: 'terms', type: 'text/html' },
    ],
    created_at: now,
    updated_at: now,
  };
}

function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function recalcTotals(session: CheckoutSession) {
  const subtotal = session.line_items.reduce((s: number, li: any) => s + li.subtotal, 0);
  const tax = session.line_items.reduce((s: number, li: any) => s + li.tax, 0);

  // Determine shipping cost from selected option
  let shippingAmount = 599;
  if (session.selected_fulfillment_option) {
    const opt = session.fulfillment_options.find(
      (o: any) => o.id === session.selected_fulfillment_option,
    );
    if (opt) shippingAmount = opt.amount;
  }

  session.totals = [
    { type: 'subtotal', display_text: 'Subtotal', amount: subtotal },
    { type: 'shipping', display_text: 'Shipping', amount: shippingAmount },
    { type: 'tax', display_text: 'Tax (8.75%)', amount: tax },
    { type: 'total', display_text: 'Order Total', amount: subtotal + shippingAmount + tax },
  ];
}

function createMockACPSeller(): Server {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url!, 'http://localhost');
    const path = url.pathname;
    let body = '';

    await new Promise<void>((resolve) => {
      req.on('data', (chunk: string) => (body += chunk));
      req.on('end', resolve);
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-ACP-Version', '2026-01-30');

    // ── POST /acp/checkouts — Create checkout session ──────────
    if (req.method === 'POST' && path === '/acp/checkouts') {
      const data = JSON.parse(body);
      const items = data.items ?? [{ id: 'unknown', quantity: 1 }];
      const session = buildCheckoutSession(items);
      sessions.set(session.id, session);

      info(`  [seller] Created checkout ${session.id} with ${items.length} item(s)`);
      res.writeHead(201);
      res.end(JSON.stringify(session));
      return;
    }

    // ── POST /acp/checkouts/:id/complete — Complete with payment ──
    const completeMatch = path.match(/^\/acp\/checkouts\/([^/]+)\/complete$/);
    if (req.method === 'POST' && completeMatch) {
      const session = sessions.get(completeMatch[1]);
      if (!session) return notFound(res);

      if (session.status === 'completed' || session.status === 'canceled') {
        res.writeHead(409);
        res.end(JSON.stringify({ error: `Cannot complete: session is ${session.status}` }));
        return;
      }

      const data = JSON.parse(body);
      if (!data.payment_data?.token) {
        res.writeHead(400);
        res.end(JSON.stringify({
          error: 'Missing payment_data.token',
          messages: [{ type: 'error', content: 'A valid payment token is required to complete checkout.', code: 'missing_token' }],
        }));
        return;
      }

      orderSeq++;
      session.status = 'completed';
      session.updated_at = new Date().toISOString();
      session.order = {
        id: `order_acp_${String(orderSeq).padStart(4, '0')}`,
        checkout_session_id: session.id,
        status: 'confirmed',
        permalink_url: `https://mock-seller.agentgate.dev/orders/order_acp_${String(orderSeq).padStart(4, '0')}`,
      };
      session.messages = [
        { type: 'info', content: `Payment accepted (token: ${data.payment_data.token}). Order confirmed.` },
      ];

      info(`  [seller] Completed checkout ${session.id} → order ${session.order.id}`);
      res.writeHead(200);
      res.end(JSON.stringify(session));
      return;
    }

    // ── POST /acp/checkouts/:id/cancel — Cancel checkout ──────
    const cancelMatch = path.match(/^\/acp\/checkouts\/([^/]+)\/cancel$/);
    if (req.method === 'POST' && cancelMatch) {
      const session = sessions.get(cancelMatch[1]);
      if (!session) return notFound(res);

      if (session.status === 'completed') {
        res.writeHead(409);
        res.end(JSON.stringify({ error: 'Cannot cancel a completed checkout. Use refund instead.' }));
        return;
      }

      const data = body ? JSON.parse(body) : {};
      session.status = 'canceled';
      session.updated_at = new Date().toISOString();
      session.messages = [
        { type: 'info', content: `Checkout canceled${data.reason ? `: ${data.reason}` : '.'}` },
      ];

      info(`  [seller] Canceled checkout ${session.id}`);
      res.writeHead(200);
      res.end(JSON.stringify(session));
      return;
    }

    // ── PUT /acp/checkouts/:id — Update checkout ──────────────
    const putMatch = path.match(/^\/acp\/checkouts\/([^/]+)$/);
    if (req.method === 'PUT' && putMatch) {
      const session = sessions.get(putMatch[1]);
      if (!session) return notFound(res);

      if (session.status === 'completed' || session.status === 'canceled') {
        res.writeHead(409);
        res.end(JSON.stringify({ error: `Cannot update: session is ${session.status}` }));
        return;
      }

      const data = JSON.parse(body);
      if (data.buyer) session.buyer = data.buyer;
      if (data.shipping_address) session.shipping_address = data.shipping_address;
      if (data.selected_fulfillment_option) {
        session.selected_fulfillment_option = data.selected_fulfillment_option;
      }
      recalcTotals(session);

      // Transition to ready_for_payment once we have buyer info
      if (session.buyer) {
        session.status = 'ready_for_payment';
      }

      session.updated_at = new Date().toISOString();
      session.messages = [{ type: 'info', content: 'Checkout updated successfully.' }];

      info(`  [seller] Updated checkout ${session.id} → status: ${session.status}`);
      res.writeHead(200);
      res.end(JSON.stringify(session));
      return;
    }

    // ── GET /acp/checkouts/:id — Retrieve checkout ────────────
    const getMatch = path.match(/^\/acp\/checkouts\/([^/]+)$/);
    if (req.method === 'GET' && getMatch) {
      const session = sessions.get(getMatch[1]);
      if (!session) return notFound(res);

      res.writeHead(200);
      res.end(JSON.stringify(session));
      return;
    }

    // ── Mock Stripe SPT endpoint ──────────────────────────────
    if (req.method === 'POST' && path === '/v1/test_helpers/shared_payment/granted_tokens') {
      sptSeq++;
      const spt = {
        id: `spt_test_demo_${String(sptSeq).padStart(4, '0')}`,
        object: 'shared_payment_token',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        usage_limits: {
          currency: 'usd',
          max_amount: 50000,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      };

      info(`  [stripe] Provisioned SPT ${spt.id}`);
      res.writeHead(200);
      res.end(JSON.stringify(spt));
      return;
    }

    // ── Fallback ──────────────────────────────────────────────
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found', path, method: req.method }));
  });
}

function notFound(res: ServerResponse) {
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Checkout session not found' }));
}

// ── Demo Runner ─────────────────────────────────────────────

async function main() {
  console.log();
  console.log(`${BOLD}${MAGENTA}  ╔══════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${MAGENTA}  ║       AgentGate — Stripe ACP Protocol Demo          ║${RESET}`);
  console.log(`${BOLD}${MAGENTA}  ║       Agentic Commerce Protocol Handshake            ║${RESET}`);
  console.log(`${BOLD}${MAGENTA}  ╚══════════════════════════════════════════════════════╝${RESET}`);

  // ── Start mock seller ──────────────────────────────────────
  header('Starting Mock ACP Seller on localhost:3400');

  const server = createMockACPSeller();
  await new Promise<void>((resolve) => server.listen(3400, resolve));
  ok('Mock ACP seller listening on http://localhost:3400');
  info('Endpoints:');
  info('  POST   /acp/checkouts              — Create checkout');
  info('  GET    /acp/checkouts/:id          — Retrieve checkout');
  info('  PUT    /acp/checkouts/:id          — Update checkout');
  info('  POST   /acp/checkouts/:id/complete — Complete with payment');
  info('  POST   /acp/checkouts/:id/cancel   — Cancel checkout');
  info('  POST   /v1/test_helpers/...        — Mock Stripe SPT provisioning');

  const BASE = 'http://localhost:3400';

  // ── Configure adapter ──────────────────────────────────────
  header('Configuring Stripe ACP Adapter (test mode)');

  const adapter = new StripeACPAdapter({
    stripeSecretKey: 'sk_test_acp_demo_key',
    stripeBaseUrl: BASE,
    timeout: 10_000,
  });

  ok(`Adapter name: ${adapter.name}`);
  ok(`Available: ${await adapter.isAvailable()}`);
  ok(`Supports purchase: ${adapter.supportsIntent('purchase')}`);
  ok(`Supports subscribe: ${adapter.supportsIntent('subscribe')}`);

  const fee = await adapter.estimateFee({
    agentId: 'agent_demo',
    intent: 'purchase',
    item: { description: 'Sony WH-1000XM5', amount: 278.00, currency: 'USD', merchantUrl: `${BASE}/products/xm5` },
    preferredProtocol: 'stripe-acp',
  });
  json('Fee estimate for $278.00', fee);

  // ── Part A: Step-by-step ACP handshake (manual) ────────────
  header('Part A: Step-by-Step ACP Handshake');
  info('Driving each ACP endpoint individually to see the full flow.');

  const sellerBase = `${BASE}/acp`;

  // Step 1: Create checkout
  step(1, 'POST', '/acp/checkouts', 'Agent initiates checkout with the seller');

  const session = await adapter.createCheckout(sellerBase, {
    agentId: 'agent_demo_manual',
    intent: 'purchase',
    item: {
      description: 'prod_xm5',
      amount: 278.00,
      currency: 'USD',
      merchantUrl: `${BASE}/products/xm5`,
    },
    preferredProtocol: 'stripe-acp',
  });

  ok(`Session created: ${session.id}`);
  ok(`Status: ${session.status}`);
  ok(`Line items: ${session.line_items.length}`);
  json('Checkout session', {
    id: session.id,
    status: session.status,
    line_items: session.line_items.map((li: any) => ({
      item: li.item.display_name ?? li.item.id,
      qty: li.item.quantity,
      subtotal: `$${(li.subtotal / 100).toFixed(2)}`,
      tax: `$${(li.tax / 100).toFixed(2)}`,
      total: `$${(li.total / 100).toFixed(2)}`,
    })),
    fulfillment_options: session.fulfillment_options?.map((o: any) => ({
      id: o.id,
      label: o.label,
      cost: `$${(o.amount / 100).toFixed(2)}`,
      delivery: o.estimated_delivery,
    })),
    totals: session.totals.map((t: any) => ({
      type: t.type,
      display: t.display_text,
      amount: `$${(t.amount / 100).toFixed(2)}`,
    })),
  });

  // Step 2: Update with buyer + shipping selection
  step(2, 'PUT', `/acp/checkouts/${session.id}`, 'Agent provides buyer info and selects express shipping');

  const updated = await adapter.updateCheckout(sellerBase, session.id, {
    buyer: {
      name: 'AgentGate Demo Bot',
      email: 'demo-bot@agentgate.dev',
      phone: '+1-555-0199',
    },
    shipping_address: {
      line1: '123 Innovation Way',
      line2: 'Suite 400',
      city: 'San Francisco',
      state: 'CA',
      postal_code: '94105',
      country: 'US',
    },
    selected_fulfillment_option: 'ship_express',
  });

  ok(`Status: ${updated.status}`);
  ok(`Buyer: ${updated.buyer?.name} (${updated.buyer?.email})`);
  ok(`Shipping: ${updated.selected_fulfillment_option}`);
  json('Updated totals', updated.totals.map((t: any) => ({
    type: t.type,
    display: t.display_text,
    amount: `$${(t.amount / 100).toFixed(2)}`,
  })));

  const totalCents = updated.totals.find((t: any) => t.type === 'total')?.amount ?? 0;
  ok(`Order total: $${(totalCents / 100).toFixed(2)}`);

  // Step 3: Retrieve (verify state before payment)
  step(3, 'GET', `/acp/checkouts/${session.id}`, 'Agent retrieves session to confirm ready_for_payment');

  const retrieved = await adapter.getCheckout(sellerBase, session.id);
  ok(`Status: ${retrieved.status}`);
  if (retrieved.status === 'ready_for_payment') {
    ok('Seller is ready to accept payment');
  } else {
    fail(`Unexpected status: ${retrieved.status}`);
  }

  // Step 4: Complete with payment token
  step(4, 'POST', `/acp/checkouts/${session.id}/complete`, 'Agent provisions SPT and completes checkout');

  info('Provisioning SharedPaymentToken via Stripe API...');
  // The adapter does this internally in execute(), but here we call complete directly.
  // We'll simulate the SPT provisioning by hitting the mock Stripe endpoint first.
  const sptRes = await fetch(`${BASE}/v1/test_helpers/shared_payment/granted_tokens`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer sk_test_acp_demo_key',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      'usage_limits[currency]': 'usd',
      'usage_limits[max_amount]': String(totalCents),
      'usage_limits[expires_at]': String(Math.floor(Date.now() / 1000) + 3600),
    }).toString(),
  });
  const spt = await sptRes.json() as { id: string; usage_limits: { currency: string; max_amount: number; expires_at: number } };
  ok(`SPT provisioned: ${spt.id}`);
  json('SharedPaymentToken', spt);

  info('Completing checkout with SPT...');
  const completed = await adapter.completeCheckout(sellerBase, session.id, {
    token: spt.id,
    provider: 'stripe',
  });

  ok(`Status: ${completed.status}`);
  ok(`Order ID: ${completed.order?.id}`);
  ok(`Order URL: ${completed.order?.permalink_url}`);
  json('Completed session', {
    id: completed.id,
    status: completed.status,
    order: completed.order,
    messages: completed.messages,
  });

  // Step 5: Verify final state
  step(5, 'GET', `/acp/checkouts/${session.id}`, 'Agent verifies the completed checkout');

  const verified = await adapter.getCheckout(sellerBase, session.id);
  ok(`Final status: ${verified.status}`);
  ok(`Order confirmed: ${verified.order?.status}`);
  if (verified.status === 'completed') {
    ok('ACP handshake completed successfully');
  } else {
    fail('Unexpected final state');
  }

  // ── Part B: Cancel flow ────────────────────────────────────
  header('Part B: Checkout Cancellation Flow');

  step(1, 'POST', '/acp/checkouts', 'Create a second checkout to demonstrate cancellation');

  const session2 = await adapter.createCheckout(sellerBase, {
    agentId: 'agent_demo_cancel',
    intent: 'purchase',
    item: {
      description: 'prod_kindle',
      amount: 149.99,
      currency: 'USD',
      merchantUrl: `${BASE}/products/kindle`,
    },
    preferredProtocol: 'stripe-acp',
  });

  ok(`Session created: ${session2.id} (status: ${session2.status})`);

  step(2, 'POST', `/acp/checkouts/${session2.id}/cancel`, 'Agent decides to cancel before payment');

  const canceled = await adapter.cancelCheckout(sellerBase, session2.id, 'Found a better price elsewhere');
  ok(`Status: ${canceled.status}`);
  json('Canceled session', {
    id: canceled.id,
    status: canceled.status,
    messages: canceled.messages,
  });

  // ── Part C: Full SDK-level transaction ─────────────────────
  header('Part C: Full SDK Transaction (gate.transact)');
  info('Running the same flow through the AgentGate SDK.');
  info('The SDK handles create → update → SPT → complete internally.');

  const gate = new AgentGate({
    apiKey: 'ag_dev_acp_demo',
    environment: 'sandbox',
    adapters: [
      new StripeACPAdapter({
        stripeSecretKey: 'sk_test_acp_demo_key',
        stripeBaseUrl: BASE,
      }),
    ],
  });

  info('Registering agent...');
  const agent = await gate.identity.register({
    name: 'acp-demo-shopper',
    owner: 'demo-user',
    capabilities: ['purchase', 'compare'],
    policies: {
      maxTransactionAmount: 500,
      dailySpendLimit: 1000,
      allowedCategories: ['electronics'],
      allowedMerchants: ['*'],
      blockedMerchants: [],
    },
  });
  ok(`Agent registered: ${agent.name} (${agent.id})`);
  ok(`Trust score: ${agent.trustScore}/100 (${getTrustLevel(agent.trustScore)})`);

  info('Executing transaction via Stripe ACP...');
  const txn = await gate.transact({
    agentId: agent.id,
    intent: 'purchase',
    item: {
      description: 'prod_coffee',
      amount: 32.00,
      currency: 'USD',
      merchantUrl: `${BASE}/products/coffee`,
      category: 'electronics', // matching policy
    },
    preferredProtocol: 'stripe-acp',
    metadata: { reason: 'Morning coffee order via ACP demo' },
  });

  ok(`Transaction ${txn.status}: ${txn.id}`);
  ok(`Protocol: ${txn.protocol}`);
  ok(`Trust impact: +${txn.trustImpact}`);
  if (txn.receipt) {
    json('Receipt', {
      transactionId: txn.receipt.transactionId,
      protocol: txn.receipt.protocol,
      amount: `$${txn.receipt.amount.toFixed(2)} ${txn.receipt.currency}`,
      checkoutSessionId: txn.receipt.protocolData?.checkoutSessionId,
      orderId: txn.receipt.protocolData?.orderId,
      orderUrl: txn.receipt.protocolData?.orderUrl,
      paymentTokenId: txn.receipt.protocolData?.paymentTokenId,
    });

    info('Verifying receipt via adapter...');
    const verification = await gate.trust.score(agent.id);
    ok(`Trust score after transaction: ${verification.score}/100 (${getTrustLevel(verification.score)})`);
    ok(`Total transactions: ${verification.totalTransactions}`);
    ok(`Success rate: ${(verification.successRate * 100).toFixed(0)}%`);
  }

  // ── Summary ────────────────────────────────────────────────
  header('Summary');
  ok('Part A: Manual ACP handshake — all 5 endpoints exercised');
  ok('Part B: Cancellation flow — session canceled before payment');
  ok('Part C: SDK-level transaction — full gate.transact() via Stripe ACP');
  console.log();
  info(`Seller served ${sessions.size} checkout session(s), ${orderSeq} order(s), ${sptSeq} SPT(s)`);
  console.log();

  // Cleanup
  server.close();
  process.exit(0);
}

function getTrustLevel(score: number): string {
  if (score >= 85) return 'verified';
  if (score >= 60) return 'trusted';
  if (score >= 30) return 'established';
  return 'new';
}

main().catch((err) => {
  console.error(`\n${RED}${BOLD}Demo failed:${RESET}`, err);
  process.exit(1);
});
