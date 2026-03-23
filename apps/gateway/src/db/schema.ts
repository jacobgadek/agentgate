import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// ── Developers ──────────────────────────────────────────────

export const developers = sqliteTable('developers', {
  id: text('id').primaryKey(),
  apiKey: text('api_key').notNull().unique(),
  email: text('email'),
  plan: text('plan', { enum: ['free', 'pro', 'enterprise'] })
    .notNull()
    .default('free'),
  createdAt: text('created_at').notNull(),
});

// ── Agents ──────────────────────────────────────────────────

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  developerId: text('developer_id')
    .notNull()
    .references(() => developers.id),
  name: text('name').notNull(),
  ownerUserId: text('owner_user_id').notNull(),
  capabilities: text('capabilities', { mode: 'json' })
    .notNull()
    .$type<string[]>(),
  policies: text('policies', { mode: 'json' })
    .notNull()
    .$type<{
      maxTransactionAmount: number;
      allowedCategories: string[];
      requireHumanApproval?: { above: number };
      allowedMerchants: string[];
      dailySpendLimit: number;
      blockedMerchants: string[];
    }>(),
  trustScore: integer('trust_score').notNull().default(50),
  totalTransactions: integer('total_transactions').notNull().default(0),
  successRate: real('success_rate').notNull().default(1.0),
  status: text('status', { enum: ['active', 'suspended', 'revoked'] })
    .notNull()
    .default('active'),
  createdAt: text('created_at').notNull(),
});

// ── Transactions ────────────────────────────────────────────

export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  agentId: text('agent_id')
    .notNull()
    .references(() => agents.id),
  developerId: text('developer_id')
    .notNull()
    .references(() => developers.id),
  intent: text('intent', { enum: ['purchase', 'subscribe', 'compare', 'refund'] }).notNull(),
  amount: real('amount').notNull(),
  currency: text('currency').notNull().default('USD'),
  merchantUrl: text('merchant_url').notNull(),
  protocol: text('protocol').notNull(),
  status: text('status', {
    enum: ['completed', 'pending_approval', 'rejected', 'failed', 'processing'],
  }).notNull(),
  receiptData: text('receipt_data', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  policyCheckResult: text('policy_check_result', { mode: 'json' })
    .notNull()
    .$type<{ allowed: boolean; violations: Array<{ rule: string; message: string }> }>(),
  humanApprovalRequired: integer('human_approval_required', { mode: 'boolean' })
    .notNull()
    .default(false),
  humanApprovalStatus: text('human_approval_status', {
    enum: ['pending', 'approved', 'denied'],
  }),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  createdAt: text('created_at').notNull(),
  completedAt: text('completed_at'),
});

// ── Audit Logs ──────────────────────────────────────────────

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  agentId: text('agent_id')
    .notNull()
    .references(() => agents.id),
  transactionId: text('transaction_id'),
  eventType: text('event_type').notNull(),
  eventData: text('event_data', { mode: 'json' })
    .notNull()
    .$type<Record<string, unknown>>(),
  signature: text('signature').notNull(),
  previousHash: text('previous_hash').notNull(),
  createdAt: text('created_at').notNull(),
});

// ── Trust Events ────────────────────────────────────────────

export const trustEvents = sqliteTable('trust_events', {
  id: text('id').primaryKey(),
  agentId: text('agent_id')
    .notNull()
    .references(() => agents.id),
  eventType: text('event_type', {
    enum: ['txn_success', 'txn_fail', 'dispute', 'verification'],
  }).notNull(),
  scoreChange: integer('score_change').notNull(),
  newScore: integer('new_score').notNull(),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  createdAt: text('created_at').notNull(),
});
