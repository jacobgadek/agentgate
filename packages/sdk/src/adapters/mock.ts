import type {
  ProtocolAdapter,
  FeeEstimate,
  VerificationResult,
  TransactionRequest,
  TransactionResult,
  TransactionReceipt,
  ValidatedTransaction,
  TransactionIntent,
  ProtocolName,
} from '@agentgate/core';
import { generateId } from '../utils/crypto.js';

export class MockAdapter implements ProtocolAdapter {
  name: ProtocolName = 'mock';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  supportsIntent(_intent: TransactionIntent): boolean {
    return true; // Mock supports all intents
  }

  async estimateFee(txn: TransactionRequest): Promise<FeeEstimate> {
    return {
      protocol: 'mock',
      fixedFee: 0,
      percentageFee: 0,
      estimatedTotal: txn.item.amount,
      currency: txn.item.currency,
    };
  }

  async execute(txn: ValidatedTransaction): Promise<TransactionResult> {
    const now = new Date().toISOString();
    const txnId = generateId('txn');

    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    return {
      id: txnId,
      agentId: txn.request.agentId,
      status: 'completed',
      protocol: 'mock',
      receipt: {
        transactionId: txnId,
        protocol: 'mock',
        amount: txn.request.item.amount,
        currency: txn.request.item.currency,
        merchantUrl: txn.request.item.merchantUrl,
        timestamp: now,
        protocolData: { mock: true },
      },
      trustImpact: 2,
      policyCheck: txn.policyCheck,
      createdAt: now,
      completedAt: now,
    };
  }

  async verify(receipt: TransactionReceipt): Promise<VerificationResult> {
    return {
      valid: true,
      protocol: 'mock',
      timestamp: new Date().toISOString(),
      details: { receiptId: receipt.transactionId, mock: true },
    };
  }
}
