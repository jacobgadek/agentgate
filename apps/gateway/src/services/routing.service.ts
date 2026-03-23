import type { ProtocolAdapter, TransactionRequest, ProtocolName } from '@agentgate/core';
import { MockAdapter, StripeACPAdapter } from '@agentgate/sdk';

const adapters: Map<string, ProtocolAdapter> = new Map();

// Register mock adapter as default
const mock = new MockAdapter();
adapters.set(mock.name, mock);

// Register Stripe ACP adapter if key is configured
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (stripeKey) {
  const stripeAcp = new StripeACPAdapter({
    stripeSecretKey: stripeKey,
    signingSecret: process.env.STRIPE_SIGNING_SECRET,
  });
  adapters.set(stripeAcp.name, stripeAcp);
  console.log('[gateway] Stripe ACP adapter registered');
}

export function registerAdapter(adapter: ProtocolAdapter) {
  adapters.set(adapter.name, adapter);
}

export function getAdapterNames(): string[] {
  return Array.from(adapters.keys());
}

export async function selectAdapter(request: TransactionRequest): Promise<ProtocolAdapter> {
  const preferred = request.preferredProtocol;

  if (preferred !== 'auto') {
    const adapter = adapters.get(preferred);
    if (!adapter) throw new Error(`No adapter found for protocol: ${preferred}`);
    if (!(await adapter.isAvailable())) throw new Error(`Adapter ${preferred} is unavailable`);
    return adapter;
  }

  // Auto: find cheapest available adapter
  let best: { adapter: ProtocolAdapter; total: number } | null = null;

  for (const adapter of adapters.values()) {
    if (!adapter.supportsIntent(request.intent)) continue;
    if (!(await adapter.isAvailable())) continue;
    const fee = await adapter.estimateFee(request);
    if (!best || fee.estimatedTotal < best.total) {
      best = { adapter, total: fee.estimatedTotal };
    }
  }

  if (!best) throw new Error('No available adapter for this transaction');
  return best.adapter;
}
