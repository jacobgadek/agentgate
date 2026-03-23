import { createHash, randomUUID } from 'node:crypto';
import { db, schema } from '../db/index.js';

// Track the latest hash per agent for the chain
const latestHashes: Map<string, string> = new Map();

const GENESIS_HASH = '0'.repeat(64);

function computeHash(eventData: Record<string, unknown>, previousHash: string): string {
  const payload = JSON.stringify(eventData) + previousHash;
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Append an immutable audit log entry with a cryptographic hash chain.
 * Each entry's signature is derived from its content + the previous entry's hash,
 * forming a tamper-evident chain.
 */
export async function appendAuditLog(params: {
  agentId: string;
  transactionId?: string;
  eventType: string;
  eventData: Record<string, unknown>;
}): Promise<void> {
  const previousHash = latestHashes.get(params.agentId) ?? GENESIS_HASH;
  const signature = computeHash(params.eventData, previousHash);
  const now = new Date().toISOString();

  await db.insert(schema.auditLogs).values({
    id: `audit_${randomUUID().replace(/-/g, '')}`,
    agentId: params.agentId,
    transactionId: params.transactionId ?? null,
    eventType: params.eventType,
    eventData: params.eventData,
    signature,
    previousHash,
    createdAt: now,
  });

  latestHashes.set(params.agentId, signature);
}

/**
 * Load the latest hash for an agent from the database (called at startup
 * or on first access to resume the chain).
 */
export async function loadLatestHash(agentId: string): Promise<string> {
  if (latestHashes.has(agentId)) return latestHashes.get(agentId)!;

  const latest = await db.query.auditLogs.findFirst({
    where: (logs, { eq }) => eq(logs.agentId, agentId),
    orderBy: (logs, { desc }) => [desc(logs.createdAt)],
  });

  const hash = latest?.signature ?? GENESIS_HASH;
  latestHashes.set(agentId, hash);
  return hash;
}
