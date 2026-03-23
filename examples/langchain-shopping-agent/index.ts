/**
 * LangChain Shopping Agent Example
 *
 * Demonstrates how to integrate AgentGate with LangChain by creating
 * custom tools that an LLM agent can use to browse products, check
 * trust scores, and make purchases.
 *
 * NOTE: This example runs in sandbox mode with mock data.
 * For a real deployment, set OPENAI_API_KEY and swap the fake model
 * invocations for actual LangChain LLM calls.
 */

import { AgentGate } from '@agentgate/sdk';
import { DynamicTool } from '@langchain/core/tools';

// ── 1. Initialize AgentGate ────────────────────────────────────────

const gate = new AgentGate({ apiKey: 'test', environment: 'sandbox' });

const agent = await gate.identity.register({
  name: 'langchain-shopper',
  capabilities: ['purchase', 'browse'],
  policies: {
    maxTransactionAmount: 200,
    dailySpendLimit: 1000,
    allowedCategories: ['electronics', 'food', 'books'],
  },
});

console.log(`✓ Agent registered: ${agent.id}\n`);

// ── 2. Define LangChain Tools ──────────────────────────────────────

// Simulated product catalog (in production, this would call a real API)
const catalog = [
  { id: 'prod_001', name: 'Wireless Earbuds', price: 49.99, category: 'electronics' },
  { id: 'prod_002', name: 'TypeScript Handbook', price: 34.99, category: 'books' },
  { id: 'prod_003', name: 'Artisan Coffee Beans', price: 24.99, category: 'food' },
  { id: 'prod_004', name: 'Mechanical Keyboard', price: 149.99, category: 'electronics' },
];

const searchProductsTool = new DynamicTool({
  name: 'search_products',
  description: 'Search the product catalog. Input: search query string.',
  func: async (query: string) => {
    const results = catalog.filter(
      (p) =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.category.toLowerCase().includes(query.toLowerCase())
    );
    return JSON.stringify(results, null, 2);
  },
});

const checkTrustTool = new DynamicTool({
  name: 'check_trust_score',
  description: 'Check the current trust score of the shopping agent.',
  func: async () => {
    const score = await gate.trust.score(agent.id);
    return `Trust Level: ${score.level}, Score: ${score.score}/100, Transactions: ${score.totalTransactions}, Success Rate: ${score.successRate}`;
  },
});

const purchaseTool = new DynamicTool({
  name: 'purchase_product',
  description: 'Purchase a product by ID. Input: product ID string.',
  func: async (productId: string) => {
    const product = catalog.find((p) => p.id === productId);
    if (!product) return `Error: Product ${productId} not found`;

    const result = await gate.transact({
      agentId: agent.id,
      intent: 'purchase',
      preferredProtocol: 'auto',
      item: {
        description: `Purchase: ${product.name}`,
        amount: product.price,
        currency: 'USD',
        merchantUrl: `https://${product.category}-store.example.com`,
        category: product.category,
      },
      metadata: { productId: product.id, productName: product.name },
    });

    return `Transaction ${result.status}: ${product.name} for $${product.price} (txn: ${result.receipt?.transactionId ?? 'N/A'})`;
  },
});

const tools = [searchProductsTool, checkTrustTool, purchaseTool];

// ── 3. Simulate Agent Workflow ─────────────────────────────────────
// In production, you'd pass these tools to a LangChain agent with an LLM.
// Here we simulate the agent's decision-making loop.

console.log('=== LangChain Shopping Agent Demo ===\n');

// Step 1: Agent searches for electronics
console.log('Agent: "I need to find some electronics"\n');
const searchResult = await tools[0].invoke('electronics');
console.log(`Tool [search_products]:\n${searchResult}\n`);

// Step 2: Agent checks trust before purchasing
console.log('Agent: "Let me check my trust score first"\n');
const trustResult = await tools[1].invoke('');
console.log(`Tool [check_trust_score]: ${trustResult}\n`);

// Step 3: Agent purchases the earbuds
console.log('Agent: "I\'ll buy the wireless earbuds"\n');
const purchaseResult = await tools[2].invoke('prod_001');
console.log(`Tool [purchase_product]: ${purchaseResult}\n`);

// Step 4: Agent buys a book too
console.log('Agent: "And the TypeScript handbook"\n');
const bookResult = await tools[2].invoke('prod_002');
console.log(`Tool [purchase_product]: ${bookResult}\n`);

// Step 5: Check trust score after transactions
console.log('Agent: "How\'s my trust score now?"\n');
const finalTrust = await tools[1].invoke('');
console.log(`Tool [check_trust_score]: ${finalTrust}\n`);

console.log('=== Demo Complete ===');
