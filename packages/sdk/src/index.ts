export { AgentGate } from './client.js';

// Re-export core types for convenience
export type {
  AgentGateConfig,
  AgentIdentity,
  RegisterAgentRequest,
  AgentPolicies,
  TransactionRequest,
  TransactionResult,
  TransactionReceipt,
  TransactionStatus,
  TransactionIntent,
  TransactionItem,
  PreferredProtocol,
  Currency,
  TrustScore,
  TrustLevel,
  TrustEvent,
  PolicyCheckResult,
  PolicyViolation,
  ProtocolAdapter,
  FeeEstimate,
  VerificationResult,
  ValidatedTransaction,
  Environment,
} from '@agentgate/core';

export { Protocol, PROTOCOL_METADATA } from '@agentgate/core';
export { MockAdapter } from './adapters/mock.js';
export { StripeACPAdapter } from './adapters/stripe-acp.js';
export type { StripeACPConfig } from './adapters/stripe-acp.js';
