import { randomUUID } from 'node:crypto';
import { db, schema, initializeDatabase } from './index.js';
import { eq } from 'drizzle-orm';

initializeDatabase();

const API_KEY = 'ag_dev_test_123';

// Check if this developer already exists
const existing = await db.query.developers.findFirst({
  where: eq(schema.developers.apiKey, API_KEY),
});

if (existing) {
  console.log(`[seed] Developer with API key "${API_KEY}" already exists (${existing.id})`);
} else {
  const devId = `dev_${randomUUID().replace(/-/g, '')}`;
  await db.insert(schema.developers).values({
    id: devId,
    apiKey: API_KEY,
    email: 'test@agentgate.dev',
    plan: 'free',
    createdAt: new Date().toISOString(),
  });
  console.log(`[seed] Inserted test developer: ${devId} (API key: ${API_KEY}, plan: free)`);
}

process.exit(0);
