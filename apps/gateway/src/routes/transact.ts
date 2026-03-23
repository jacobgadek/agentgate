import { Hono } from 'hono';
import type { AuthEnv } from '../middleware/auth.js';
import * as txnService from '../services/transaction.service.js';

const transact = new Hono<AuthEnv>();

// GET /v1/transact — list all transactions for developer
transact.get('/', async (c) => {
  const developerId = c.get('developerId');
  const limit = Math.min(Number(c.req.query('limit') ?? 100), 500);
  const txns = await txnService.listTransactions(developerId, limit);
  return c.json({ transactions: txns });
});

// POST /v1/transact
transact.post('/', async (c) => {
  const developerId = c.get('developerId');
  const body = await c.req.json();

  if (!body.agentId || !body.intent || !body.item) {
    return c.json({ error: 'Missing required fields: agentId, intent, item' }, 400);
  }

  try {
    const result = await txnService.executeTransaction(developerId, {
      agentId: body.agentId,
      intent: body.intent,
      item: body.item,
      preferredProtocol: body.preferredProtocol ?? 'auto',
      metadata: body.metadata,
    });

    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

// GET /v1/transact/:txnId
transact.get('/:txnId', async (c) => {
  const developerId = c.get('developerId');
  const txnId = c.req.param('txnId');

  const txn = await txnService.getTransaction(txnId, developerId);
  if (!txn) return c.json({ error: 'Transaction not found' }, 404);

  return c.json(txn);
});

// POST /v1/transact/:txnId/approve
transact.post('/:txnId/approve', async (c) => {
  const developerId = c.get('developerId');
  const txnId = c.req.param('txnId');
  const body = await c.req.json();

  try {
    const result = await txnService.approveTransaction(
      txnId,
      developerId,
      body.approved !== false, // default to approve
    );
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

export { transact };
