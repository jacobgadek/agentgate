import { randomUUID } from 'node:crypto';
import { eq, and, gte } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { selectAdapter } from './routing.service.js';
import { appendAuditLog } from '../middleware/audit.js';
import type { TransactionRequest, PreferredProtocol } from '@agentgate/core';
import type { TransactionIntent, Currency } from '@agentgate/core';

export interface ExecuteTransactionInput {
  agentId: string;
  intent: TransactionIntent;
  item: {
    description: string;
    amount: number;
    currency: Currency;
    merchantUrl: string;
    category?: string;
  };
  preferredProtocol: PreferredProtocol;
  metadata?: Record<string, unknown>;
}

export async function executeTransaction(developerId: string, input: ExecuteTransactionInput) {
  // 1. Look up agent
  const agent = await db.query.agents.findFirst({
    where: (a, { and: a2, eq: e }) =>
      a2(e(a.id, input.agentId), e(a.developerId, developerId)),
  });

  if (!agent) throw new Error('Agent not found');
  if (agent.status !== 'active') throw new Error(`Agent is ${agent.status}`);

  const policies = agent.policies;

  // 2. Policy checks
  const violations: Array<{ rule: string; message: string }> = [];

  if (input.item.amount > policies.maxTransactionAmount) {
    violations.push({
      rule: 'maxTransactionAmount',
      message: `Amount $${input.item.amount} exceeds limit $${policies.maxTransactionAmount}`,
    });
  }

  // Daily spend check
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todaysTxns = await db.query.transactions.findMany({
    where: (t, { and: a2, eq: e, gte: g }) =>
      a2(e(t.agentId, input.agentId), e(t.status, 'completed'), g(t.createdAt, todayStart.toISOString())),
  });
  const dailySpent = todaysTxns.reduce((sum, t) => sum + t.amount, 0);

  if (dailySpent + input.item.amount > policies.dailySpendLimit) {
    violations.push({
      rule: 'dailySpendLimit',
      message: `Would exceed daily limit $${policies.dailySpendLimit} (spent $${dailySpent} today)`,
    });
  }

  if (input.item.category && policies.allowedCategories.length > 0 &&
      !policies.allowedCategories.includes(input.item.category)) {
    violations.push({ rule: 'allowedCategories', message: `Category "${input.item.category}" not allowed` });
  }

  if (policies.blockedMerchants.some((m: string) => input.item.merchantUrl.includes(m))) {
    violations.push({ rule: 'blockedMerchants', message: `Merchant is blocked` });
  }

  if (!policies.allowedMerchants.includes('*') && policies.allowedMerchants.length > 0 &&
      !policies.allowedMerchants.some((m: string) => input.item.merchantUrl.includes(m))) {
    violations.push({ rule: 'allowedMerchants', message: `Merchant not in allowed list` });
  }

  const policyCheck = { allowed: violations.length === 0, violations };

  if (!policyCheck.allowed) {
    const txnId = `txn_${randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();

    await db.insert(schema.transactions).values({
      id: txnId,
      agentId: input.agentId,
      developerId,
      intent: input.intent,
      amount: input.item.amount,
      currency: input.item.currency,
      merchantUrl: input.item.merchantUrl,
      protocol: 'none',
      status: 'rejected',
      policyCheckResult: policyCheck,
      humanApprovalRequired: false,
      metadata: input.metadata ?? null,
      createdAt: now,
      completedAt: now,
    });

    await appendAuditLog({
      agentId: input.agentId,
      transactionId: txnId,
      eventType: 'transaction_rejected',
      eventData: { reason: 'policy_violation', violations },
    });

    return {
      id: txnId,
      agentId: input.agentId,
      status: 'rejected' as const,
      protocol: 'none',
      receipt: null,
      trustImpact: -1,
      policyCheck,
      createdAt: now,
      completedAt: now,
    };
  }

  // 3. Human approval check
  const needsApproval = !!policies.requireHumanApproval &&
    input.item.amount > policies.requireHumanApproval.above;

  if (needsApproval) {
    const txnId = `txn_${randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();

    await db.insert(schema.transactions).values({
      id: txnId,
      agentId: input.agentId,
      developerId,
      intent: input.intent,
      amount: input.item.amount,
      currency: input.item.currency,
      merchantUrl: input.item.merchantUrl,
      protocol: 'pending',
      status: 'pending_approval',
      policyCheckResult: policyCheck,
      humanApprovalRequired: true,
      humanApprovalStatus: 'pending',
      metadata: input.metadata ?? null,
      createdAt: now,
    });

    await appendAuditLog({
      agentId: input.agentId,
      transactionId: txnId,
      eventType: 'transaction_pending_approval',
      eventData: { amount: input.item.amount, reason: 'exceeds_approval_threshold' },
    });

    return {
      id: txnId,
      agentId: input.agentId,
      status: 'pending_approval' as const,
      protocol: 'pending',
      receipt: null,
      trustImpact: 0,
      policyCheck,
      createdAt: now,
      completedAt: null,
    };
  }

  // 4. Route and execute
  const txnRequest: TransactionRequest = {
    agentId: input.agentId,
    intent: input.intent,
    item: {
      description: input.item.description,
      amount: input.item.amount,
      currency: input.item.currency,
      merchantUrl: input.item.merchantUrl,
      category: input.item.category,
    },
    preferredProtocol: input.preferredProtocol,
    metadata: input.metadata,
  };

  const adapter = await selectAdapter(txnRequest);
  const result = await adapter.execute({
    request: txnRequest,
    agent: {
      id: agent.id,
      developerId: agent.developerId,
      name: agent.name,
      owner: agent.ownerUserId,
      capabilities: agent.capabilities,
      policies: agent.policies,
      trustScore: agent.trustScore,
      totalTransactions: agent.totalTransactions,
      successRate: agent.successRate,
      status: agent.status,
      createdAt: agent.createdAt,
    },
    policyCheck,
  });

  // 5. Persist
  await db.insert(schema.transactions).values({
    id: result.id,
    agentId: input.agentId,
    developerId,
    intent: input.intent,
    amount: input.item.amount,
    currency: input.item.currency,
    merchantUrl: input.item.merchantUrl,
    protocol: result.protocol,
    status: result.status,
    receiptData: result.receipt as unknown as Record<string, unknown> | null,
    policyCheckResult: policyCheck,
    humanApprovalRequired: false,
    metadata: input.metadata ?? null,
    createdAt: result.createdAt,
    completedAt: result.completedAt,
  });

  // 6. Update agent stats
  if (result.status === 'completed') {
    const newTotal = agent.totalTransactions + 1;
    const newScore = Math.min(100, Math.max(0, agent.trustScore + result.trustImpact));
    await db.update(schema.agents)
      .set({ totalTransactions: newTotal, trustScore: newScore })
      .where(eq(schema.agents.id, input.agentId));

    await appendAuditLog({
      agentId: input.agentId,
      transactionId: result.id,
      eventType: 'transaction_completed',
      eventData: { protocol: result.protocol, amount: input.item.amount },
    });

    // Record trust event
    await db.insert(schema.trustEvents).values({
      id: `te_${randomUUID().replace(/-/g, '')}`,
      agentId: input.agentId,
      eventType: 'txn_success',
      scoreChange: result.trustImpact,
      newScore,
      metadata: { transactionId: result.id },
      createdAt: new Date().toISOString(),
    });
  }

  return result;
}

export async function listTransactions(developerId: string, limit: number = 100) {
  return db.query.transactions.findMany({
    where: eq(schema.transactions.developerId, developerId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    limit,
  });
}

export async function getTransaction(txnId: string, developerId: string) {
  return db.query.transactions.findFirst({
    where: (t, { and: a2, eq: e }) =>
      a2(e(t.id, txnId), e(t.developerId, developerId)),
  });
}

export async function approveTransaction(txnId: string, developerId: string, approved: boolean) {
  const txn = await db.query.transactions.findFirst({
    where: (t, { and: a2, eq: e }) =>
      a2(e(t.id, txnId), e(t.developerId, developerId)),
  });

  if (!txn) throw new Error('Transaction not found');
  if (txn.status !== 'pending_approval') throw new Error('Transaction is not pending approval');

  if (!approved) {
    await db.update(schema.transactions)
      .set({ status: 'rejected', humanApprovalStatus: 'denied', completedAt: new Date().toISOString() })
      .where(eq(schema.transactions.id, txnId));

    await appendAuditLog({
      agentId: txn.agentId,
      transactionId: txnId,
      eventType: 'transaction_denied',
      eventData: { reason: 'human_denied' },
    });

    return { ...txn, status: 'rejected' as const, humanApprovalStatus: 'denied' as const };
  }

  // Re-execute through adapter
  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, txn.agentId),
  });
  if (!agent) throw new Error('Agent not found');

  const txnRequest: TransactionRequest = {
    agentId: txn.agentId,
    intent: txn.intent as TransactionIntent,
    item: {
      description: `Approved transaction`,
      amount: txn.amount,
      currency: txn.currency as Currency,
      merchantUrl: txn.merchantUrl,
    },
    preferredProtocol: 'auto',
  };

  const adapter = await selectAdapter(txnRequest);
  const result = await adapter.execute({
    request: txnRequest,
    agent: {
      id: agent.id,
      developerId: agent.developerId,
      name: agent.name,
      owner: agent.ownerUserId,
      capabilities: agent.capabilities,
      policies: agent.policies,
      trustScore: agent.trustScore,
      totalTransactions: agent.totalTransactions,
      successRate: agent.successRate,
      status: agent.status,
      createdAt: agent.createdAt,
    },
    policyCheck: txn.policyCheckResult,
  });

  const now = new Date().toISOString();
  await db.update(schema.transactions)
    .set({
      status: 'completed',
      humanApprovalStatus: 'approved',
      protocol: result.protocol,
      receiptData: result.receipt as unknown as Record<string, unknown> | null,
      completedAt: now,
    })
    .where(eq(schema.transactions.id, txnId));

  // Update trust
  const newScore = Math.min(100, Math.max(0, agent.trustScore + result.trustImpact));
  await db.update(schema.agents)
    .set({
      totalTransactions: agent.totalTransactions + 1,
      trustScore: newScore,
    })
    .where(eq(schema.agents.id, txn.agentId));

  await appendAuditLog({
    agentId: txn.agentId,
    transactionId: txnId,
    eventType: 'transaction_approved_completed',
    eventData: { protocol: result.protocol, amount: txn.amount },
  });

  return { ...txn, status: 'completed', humanApprovalStatus: 'approved', protocol: result.protocol };
}
