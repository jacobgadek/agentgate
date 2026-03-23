const BASE = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3100';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'ag_dev_test_123';

async function gw<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Gateway ${res.status}`);
  }
  return res.json();
}

// ── Types ──────────────────────────────────────────────────

export interface Agent {
  id: string;
  developerId: string;
  name: string;
  ownerUserId: string;
  capabilities: string[];
  policies: {
    maxTransactionAmount: number;
    allowedCategories: string[];
    requireHumanApproval?: { above: number };
    allowedMerchants: string[];
    dailySpendLimit: number;
    blockedMerchants: string[];
  };
  trustScore: number;
  totalTransactions: number;
  successRate: number;
  status: 'active' | 'suspended' | 'revoked';
  createdAt: string;
}

export interface Transaction {
  id: string;
  agentId: string;
  developerId: string;
  intent: string;
  amount: number;
  currency: string;
  merchantUrl: string;
  protocol: string;
  status: 'completed' | 'pending_approval' | 'rejected' | 'failed' | 'processing';
  receiptData: Record<string, unknown> | null;
  policyCheckResult: { allowed: boolean; violations: Array<{ rule: string; message: string }> };
  humanApprovalRequired: boolean;
  humanApprovalStatus: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  completedAt: string | null;
}

export interface TrustScore {
  agentId: string;
  score: number;
  totalTransactions: number;
  successRate: number;
  level: string;
}

export interface HealthResponse {
  status: string;
  version: string;
  timestamp: string;
}

// ── API calls ──────────────────────────────────────────────

export const api = {
  health: () => gw<HealthResponse>('/v1/health'),
  listAgents: () => gw<{ agents: Agent[] }>('/v1/identity').then(r => r.agents),
  getAgent: (id: string) => gw<Agent>(`/v1/identity/${id}`),
  listTransactions: (limit = 100) =>
    gw<{ transactions: Transaction[] }>(`/v1/transact?limit=${limit}`).then(r => r.transactions),
  getTransaction: (id: string) => gw<Transaction>(`/v1/transact/${id}`),
  getTrustScore: (agentId: string) => gw<TrustScore>(`/v1/trust/${agentId}`),
  approveTransaction: (txnId: string, approved: boolean) =>
    gw<Transaction>(`/v1/transact/${txnId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approved }),
    }),
};
