import { createHash, randomUUID } from 'node:crypto';

export function generateId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

export function hashData(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function createChainHash(eventData: Record<string, unknown>, previousHash: string): string {
  const payload = JSON.stringify(eventData) + previousHash;
  return hashData(payload);
}
