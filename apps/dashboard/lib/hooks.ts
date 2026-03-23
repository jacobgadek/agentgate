'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, type Agent, type Transaction } from './api';

export function useAgents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.listAgents();
      setAgents(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { agents, loading, error, refresh };
}

export function useTransactions(limit = 100) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.listTransactions(limit);
      setTransactions(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => { refresh(); }, [refresh]);

  return { transactions, loading, error, refresh };
}

export function useGatewayHealth() {
  const [connected, setConnected] = useState(false);
  const [version, setVersion] = useState('');

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const h = await api.health();
        if (active) { setConnected(true); setVersion(h.version); }
      } catch {
        if (active) setConnected(false);
      }
    };
    check();
    const interval = setInterval(check, 15000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  return { connected, version };
}
