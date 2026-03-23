import { AgentGate } from '@agentgate/sdk';
import { MockMerchant } from './mock-merchant.js';

async function main() {
  console.log('='.repeat(60));
  console.log('  AgentGate Sandbox Demo');
  console.log('='.repeat(60));
  console.log();

  // ── Step 1: Initialize the SDK ──────────────────────────
  const gate = new AgentGate({
    apiKey: 'ag_dev_sandbox_demo',
    environment: 'sandbox',
  });
  console.log('[1/5] SDK initialized in sandbox mode\n');

  // ── Step 2: Register an agent identity ──────────────────
  const agent = await gate.identity.register({
    name: 'shopping-assistant',
    owner: 'user_12345',
    capabilities: ['purchase', 'compare', 'subscribe'],
    policies: {
      maxTransactionAmount: 500,
      allowedCategories: ['electronics', 'books', 'groceries'],
      requireHumanApproval: { above: 100 },
      allowedMerchants: ['*'],
      dailySpendLimit: 1000,
      blockedMerchants: [],
    },
  });
  console.log(`[2/5] Agent registered: ${agent.name} (${agent.id})`);
  console.log(`      Trust score: ${agent.trustScore} | Status: ${agent.status}\n`);

  // ── Step 3: Browse merchant catalog ─────────────────────
  const merchant = new MockMerchant();
  const products = merchant.search('headphones');
  console.log(`[3/5] Found ${products.length} product(s) matching "headphones":`);
  for (const p of products) {
    console.log(`      - ${p.name}: $${p.price}`);
  }
  console.log();

  // ── Step 4: Execute a transaction (under $100 — no approval needed) ──
  const book = merchant.getProduct('prod_002')!;
  console.log(`[4/5] Purchasing: ${book.name} ($${book.price})`);

  const txn1 = await gate.transact({
    agentId: agent.id,
    intent: 'purchase',
    item: {
      description: book.name,
      amount: book.price,
      currency: 'USD',
      merchantUrl: book.merchantUrl,
      category: book.category,
    },
    preferredProtocol: 'auto',
    metadata: { reason: 'User wants a programming book' },
  });

  console.log(`      Status: ${txn1.status}`);
  console.log(`      Protocol: ${txn1.protocol}`);
  console.log(`      Transaction ID: ${txn1.id}`);
  console.log(`      Trust impact: +${txn1.trustImpact}\n`);

  // ── Step 5: Execute a larger transaction (requires approval) ──
  const headphones = products[0];
  console.log(`[5/5] Purchasing: ${headphones.name} ($${headphones.price})`);
  console.log('      (This exceeds $100 — should require human approval)');

  const txn2 = await gate.transact({
    agentId: agent.id,
    intent: 'purchase',
    item: {
      description: headphones.name,
      amount: headphones.price,
      currency: 'USD',
      merchantUrl: headphones.merchantUrl,
      category: headphones.category,
    },
    preferredProtocol: 'auto',
    metadata: { reason: 'User requested noise-cancelling headphones under $300' },
  });

  console.log(`      Status: ${txn2.status}`);
  console.log(`      (Human approval pending — as expected)\n`);

  // ── Check trust score ───────────────────────────────────
  const trust = await gate.trust.score(agent.id);
  console.log('-'.repeat(60));
  console.log('  Final Trust Score Report');
  console.log('-'.repeat(60));
  console.log(`  Agent: ${agent.name}`);
  console.log(`  Score: ${trust.score}/100`);
  console.log(`  Level: ${trust.level}`);
  console.log(`  Total transactions: ${trust.totalTransactions}`);
  console.log(`  Success rate: ${(trust.successRate * 100).toFixed(0)}%`);
  console.log();
  console.log('  Protocols available:', gate.listProtocols().join(', '));
  console.log('='.repeat(60));
  console.log('  Demo complete!');
  console.log('='.repeat(60));
}

main().catch(console.error);
