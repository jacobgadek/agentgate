import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

const DB_PATH = process.env.DATABASE_URL ?? 'agentgate.db';

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

export function initializeDatabase() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS developers (
      id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL UNIQUE,
      email TEXT,
      plan TEXT NOT NULL DEFAULT 'free',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      developer_id TEXT NOT NULL REFERENCES developers(id),
      name TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      capabilities TEXT NOT NULL,
      policies TEXT NOT NULL,
      trust_score INTEGER NOT NULL DEFAULT 50,
      total_transactions INTEGER NOT NULL DEFAULT 0,
      success_rate REAL NOT NULL DEFAULT 1.0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      developer_id TEXT NOT NULL REFERENCES developers(id),
      intent TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      merchant_url TEXT NOT NULL,
      protocol TEXT NOT NULL,
      status TEXT NOT NULL,
      receipt_data TEXT,
      policy_check_result TEXT NOT NULL,
      human_approval_required INTEGER NOT NULL DEFAULT 0,
      human_approval_status TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      transaction_id TEXT,
      event_type TEXT NOT NULL,
      event_data TEXT NOT NULL,
      signature TEXT NOT NULL,
      previous_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trust_events (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      event_type TEXT NOT NULL,
      score_change INTEGER NOT NULL,
      new_score INTEGER NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL
    );
  `);
}

export { schema };
