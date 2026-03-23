import type { ProtocolAdapter, TransactionRequest, ProtocolName } from '@agentgate/core';
import { AdapterNotFoundError } from '../utils/errors.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger();

export class TransactionRouter {
  private adapters: Map<ProtocolName, ProtocolAdapter> = new Map();

  registerAdapter(adapter: ProtocolAdapter): void {
    this.adapters.set(adapter.name, adapter);
    logger.debug(`Registered adapter: ${adapter.name}`);
  }

  getAdapter(name: ProtocolName): ProtocolAdapter | undefined {
    return this.adapters.get(name);
  }

  async selectAdapter(request: TransactionRequest): Promise<ProtocolAdapter> {
    const preferred = request.preferredProtocol;

    // If a specific protocol is requested, use it
    if (preferred !== 'auto') {
      const adapter = this.adapters.get(preferred as ProtocolName);
      if (!adapter) throw new AdapterNotFoundError(preferred);
      const available = await adapter.isAvailable();
      if (!available) throw new AdapterNotFoundError(`${preferred} (unavailable)`);
      return adapter;
    }

    // Auto-select: find the best available adapter that supports this intent
    const candidates: Array<{ adapter: ProtocolAdapter; fee: number }> = [];

    for (const adapter of this.adapters.values()) {
      if (!adapter.supportsIntent(request.intent)) continue;
      const available = await adapter.isAvailable();
      if (!available) continue;

      const fee = await adapter.estimateFee(request);
      candidates.push({ adapter, fee: fee.estimatedTotal });
    }

    if (candidates.length === 0) {
      throw new AdapterNotFoundError('No available adapter for this transaction');
    }

    // Sort by lowest total cost
    candidates.sort((a, b) => a.fee - b.fee);
    logger.debug(`Selected adapter: ${candidates[0].adapter.name} (lowest fee)`);
    return candidates[0].adapter;
  }

  listAdapters(): ProtocolName[] {
    return Array.from(this.adapters.keys());
  }
}
