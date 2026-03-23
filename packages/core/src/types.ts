import type { Protocol, ProtocolName } from './protocols.js';
import type { TRANSACTION_STATUSES, SUPPORTED_CURRENCIES, TRUST_LEVELS } from './constants.js';

// ── Environment ─────────────────────────────────────────────

export type Environment = 'sandbox' | 'production';

// ── Identity ────────────────────────────────────────────────

export interface AgentIdentity {
  id: string;
  developerId: string;
  name: string;
  owner: string;
  capabilities: string[];
  policies: AgentPolicies;
  trustScore: number;
  totalTransactions: number;
  successRate: number;
  status: 'active' | 'suspended' | 'revoked';
  createdAt: string;
}

export interface RegisterAgentRequest {
  name: string;
  owner: string;
  capabilities: string[];
  policies: AgentPolicies;
}

// ── Policies ────────────────────────────────────────────────

export interface AgentPolicies {
  maxTransactionAmount: number;
  allowedCategories: string[];
  requireHumanApproval?: {
    above: number;
  };
  allowedMerchants: string[];
  dailySpendLimit: number;
  blockedMerchants: string[];
}

export interface PolicyCheckResult {
  allowed: boolean;
  violations: PolicyViolation[];
}

export interface PolicyViolation {
  rule: string;
  message: string;
  value?: unknown;
  limit?: unknown;
}

// ── Transactions ────────────────────────────────────────────

export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export type TransactionIntent = 'purchase' | 'subscribe' | 'compare' | 'refund';

export type PreferredProtocol = ProtocolName | 'auto';

export interface TransactionItem {
  description: string;
  amount: number;
  currency: Currency;
  merchantUrl: string;
  category?: string;
}

export interface TransactionRequest {
  agentId: string;
  intent: TransactionIntent;
  item: TransactionItem;
  preferredProtocol: PreferredProtocol;
  metadata?: Record<string, unknown>;
}

export interface TransactionResult {
  id: string;
  agentId: string;
  status: TransactionStatus;
  protocol: ProtocolName;
  receipt: TransactionReceipt | null;
  trustImpact: number;
  policyCheck: PolicyCheckResult;
  createdAt: string;
  completedAt: string | null;
}

export interface TransactionReceipt {
  transactionId: string;
  protocol: ProtocolName;
  amount: number;
  currency: Currency;
  merchantUrl: string;
  timestamp: string;
  protocolData?: Record<string, unknown>;
}

export interface ValidatedTransaction {
  request: TransactionRequest;
  agent: AgentIdentity;
  policyCheck: PolicyCheckResult;
}

// ── Trust ───────────────────────────────────────────────────

export type TrustLevel = keyof typeof TRUST_LEVELS;

export interface TrustScore {
  agentId: string;
  score: number;
  totalTransactions: number;
  successRate: number;
  level: TrustLevel;
}

export interface TrustEvent {
  id: string;
  agentId: string;
  eventType: 'txn_success' | 'txn_fail' | 'dispute' | 'verification';
  scoreChange: number;
  newScore: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ── Adapters ────────────────────────────────────────────────

export interface FeeEstimate {
  protocol: ProtocolName;
  fixedFee: number;
  percentageFee: number;
  estimatedTotal: number;
  currency: Currency;
}

export interface VerificationResult {
  valid: boolean;
  protocol: ProtocolName;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface ProtocolAdapter {
  name: ProtocolName;
  isAvailable(): Promise<boolean>;
  supportsIntent(intent: TransactionIntent): boolean;
  estimateFee(txn: TransactionRequest): Promise<FeeEstimate>;
  execute(txn: ValidatedTransaction): Promise<TransactionResult>;
  verify(receipt: TransactionReceipt): Promise<VerificationResult>;
}

// ── Audit ───────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  agentId: string;
  transactionId?: string;
  eventType: string;
  eventData: Record<string, unknown>;
  signature: string;
  previousHash: string;
  createdAt: string;
}

// ── SDK Config ──────────────────────────────────────────────

export interface AgentGateConfig {
  apiKey: string;
  environment?: Environment;
  gatewayUrl?: string;
  adapters?: ProtocolAdapter[];
}
