'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAgents, useTransactions, useGatewayHealth } from '@/lib/hooks';
import { formatCurrency, timeAgo, getTrustLevel } from '@/lib/utils';
import { api, type Agent, type Transaction } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { TrustGauge } from '@/components/TrustGauge';
import { ProtocolBar } from '@/components/ProtocolBar';
import { MiniChart } from '@/components/MiniChart';

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
  padding: 20,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600,
  letterSpacing: '0.05em', textTransform: 'uppercase',
  fontFamily: "'IBM Plex Mono', monospace",
};

export default function Dashboard() {
  const [view, setView] = useState<'overview' | 'agents' | 'transactions' | 'protocols'>('overview');
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const { connected, version } = useGatewayHealth();
  const { agents, loading: agentsLoading, error: agentsError, refresh: refreshAgents } = useAgents();
  const { transactions, loading: txnsLoading, error: txnsError, refresh: refreshTxns } = useTransactions(200);

  // Auto-refresh every 10s
  useEffect(() => {
    const t = setInterval(() => { refreshAgents(); refreshTxns(); }, 10000);
    return () => clearInterval(t);
  }, [refreshAgents, refreshTxns]);

  // Derived stats
  const stats = useMemo(() => {
    const totalVolume = transactions
      .filter(t => t.status === 'completed')
      .reduce((s, t) => s + t.amount, 0);
    const activeAgents = agents.filter(a => a.status === 'active').length;
    const avgTrust = agents.length > 0
      ? agents.reduce((s, a) => s + a.trustScore, 0) / agents.length
      : 0;
    const pending = transactions.filter(t => t.status === 'pending_approval').length;
    const failed = transactions.filter(t => t.status === 'failed' || t.status === 'rejected').length;

    const protocolBreakdown: Record<string, number> = {};
    for (const t of transactions) {
      if (t.protocol && t.protocol !== 'none' && t.protocol !== 'pending') {
        protocolBreakdown[t.protocol] = (protocolBreakdown[t.protocol] || 0) + 1;
      }
    }

    // Volume by day (last 7 days)
    const dayMap: Record<string, number> = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dayMap[key] = 0;
    }
    for (const t of transactions) {
      if (t.status === 'completed') {
        const d = new Date(t.createdAt);
        const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (key in dayMap) dayMap[key] += t.amount;
      }
    }
    const volumeData = Object.entries(dayMap).map(([label, value]) => ({ label, value }));

    return { totalVolume, activeAgents, avgTrust, pending, failed, protocolBreakdown, volumeData };
  }, [agents, transactions]);

  // Agent detail: filtered transactions
  const agentTxns = useMemo(
    () => selectedAgent ? transactions.filter(t => t.agentId === selectedAgent.id) : [],
    [selectedAgent, transactions],
  );

  // Resolve agent names
  const agentNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of agents) m[a.id] = a.name;
    return m;
  }, [agents]);

  const navItems = [
    { id: 'overview' as const, label: 'Overview', icon: '\u25EB' },
    { id: 'agents' as const, label: 'Agents', icon: '\u25C9' },
    { id: 'transactions' as const, label: 'Transactions', icon: '\u21C4' },
    { id: 'protocols' as const, label: 'Protocols', icon: '\u2B21' },
  ];

  const loading = agentsLoading || txnsLoading;
  const error = agentsError || txnsError;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e2e8f0', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .fade-up { animation: fadeUp 0.4s ease both; }
        .card-hover { transition: border-color 0.2s ease, background 0.2s ease; }
        .card-hover:hover { border-color: rgba(255,255,255,0.12) !important; background: rgba(255,255,255,0.05) !important; }
        .row-hover { transition: background 0.15s ease; cursor: pointer; }
        .row-hover:hover { background: rgba(255,255,255,0.03); }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #a78bfa, #635bff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff' }}>A</div>
              <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>AgentGate</span>
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: 'rgba(167,139,250,0.15)', color: '#a78bfa', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>v0.1.0</span>
            </div>
            <nav style={{ display: 'flex', gap: 4 }}>
              {navItems.map(item => (
                <button key={item.id} onClick={() => { setView(item.id); setSelectedAgent(null); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8,
                    border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                    background: view === item.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: view === item.id ? '#fff' : 'rgba(255,255,255,0.45)',
                    transition: 'all 0.15s ease', fontFamily: 'inherit',
                  }}>
                  <span style={{ fontSize: 14 }}>{item.icon}</span>{item.label}
                </button>
              ))}
            </nav>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: connected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${connected ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? '#22c55e' : '#ef4444', animation: 'pulse 2s ease infinite' }} />
              <span style={{ fontSize: 11, color: connected ? '#22c55e' : '#ef4444', fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>
                {connected ? 'LIVE' : 'OFFLINE'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono', monospace" }}>
              localhost:3100
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 32px' }}>
        {/* Error banner */}
        {error && (
          <div style={{ ...cardStyle, marginBottom: 16, borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)' }}>
            <div style={{ fontSize: 13, color: '#ef4444' }}>
              Gateway connection error: {error}. Make sure the gateway is running on localhost:3100.
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !error && agents.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Loading data from gateway...</div>
          </div>
        )}

        {/* OVERVIEW */}
        {view === 'overview' && (
          <div className="fade-up">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Transaction Volume', value: formatCurrency(stats.totalVolume), sub: `${transactions.length} total`, accent: '#a78bfa' },
                { label: 'Active Agents', value: String(stats.activeAgents), sub: `of ${agents.length} registered`, accent: '#22c55e' },
                { label: 'Avg Trust Score', value: stats.avgTrust.toFixed(1), sub: 'across all agents', accent: '#fbbf24' },
                { label: 'Pending Approvals', value: String(stats.pending), sub: `${stats.failed} failed/rejected`, accent: stats.pending > 0 ? '#ef4444' : '#64748b' },
              ].map((stat, i) => (
                <div key={i} style={{ ...cardStyle, animationDelay: `${i * 0.05}s` }} className="fade-up card-hover">
                  <div style={{ ...labelStyle, marginBottom: 10 }}>{stat.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: stat.accent, letterSpacing: '-0.03em', lineHeight: 1 }}>{stat.value}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>{stat.sub}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div style={cardStyle} className="card-hover">
                <div style={{ ...labelStyle, marginBottom: 16 }}>7-Day Volume</div>
                <MiniChart data={stats.volumeData} height={80} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  {stats.volumeData.map((d, i) => (
                    <span key={i} style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: "'IBM Plex Mono', monospace" }}>{d.label.split(' ')[1]}</span>
                  ))}
                </div>
              </div>
              <div style={cardStyle} className="card-hover">
                <div style={{ ...labelStyle, marginBottom: 16 }}>Protocol Distribution</div>
                <ProtocolBar breakdown={stats.protocolBreakdown} />
                <div style={{ marginTop: 20, padding: 14, borderRadius: 8, background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.1)' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                    <span style={{ color: '#a78bfa', fontWeight: 600 }}>Routing:</span> Auto-routing enabled. Transactions route to lowest-fee available protocol.
                  </div>
                </div>
              </div>
            </div>

            {/* Recent transactions */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={labelStyle}>Recent Transactions</div>
                <button onClick={() => setView('transactions')} style={{ fontSize: 11, color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500 }}>View all &rarr;</button>
              </div>
              {transactions.length === 0 && !loading ? (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', padding: 20, textAlign: 'center' }}>No transactions yet. Use the SDK or sandbox to create some.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {transactions.slice(0, 5).map((txn, i) => (
                    <div key={txn.id} className="row-hover" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 100px 100px 80px 80px', alignItems: 'center', padding: '12px 8px', borderBottom: i < Math.min(transactions.length, 5) - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{txn.metadata?.productName as string || txn.merchantUrl}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>{txn.merchantUrl}</div>
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: "'IBM Plex Mono', monospace" }}>{agentNameMap[txn.agentId] || txn.agentId.slice(0, 16)}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>{formatCurrency(txn.amount)}</div>
                      <StatusBadge status={txn.status} />
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: "'IBM Plex Mono', monospace" }}>{txn.protocol}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'right' }}>{timeAgo(txn.createdAt)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* AGENTS LIST */}
        {view === 'agents' && !selectedAgent && (
          <div className="fade-up">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>Agents</h2>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{agents.length} registered, {agents.filter(a => a.status === 'active').length} active</p>
              </div>
            </div>
            {agents.length === 0 && !loading ? (
              <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No agents registered yet. Use the SDK to register one.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {agents.map((agent, i) => (
                  <div key={agent.id} onClick={() => setSelectedAgent(agent)} className="card-hover fade-up"
                    style={{ ...cardStyle, cursor: 'pointer', display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto auto', alignItems: 'center', gap: 24, animationDelay: `${i * 0.05}s` }}>
                    <TrustGauge score={agent.trustScore} size={48} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{agent.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: "'IBM Plex Mono', monospace", marginTop: 3 }}>{agent.id}</div>
                    </div>
                    <StatusBadge status={agent.status} />
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>{agent.totalTransactions}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>transactions</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: agent.successRate >= 0.95 ? '#22c55e' : agent.successRate >= 0.8 ? '#fbbf24' : '#ef4444' }}>{(agent.successRate * 100).toFixed(0)}%</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>success</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>{formatCurrency(agent.policies.dailySpendLimit)}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>daily limit</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* AGENT DETAIL */}
        {view === 'agents' && selectedAgent && (
          <div className="fade-up">
            <button onClick={() => setSelectedAgent(null)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#a78bfa', fontSize: 12, cursor: 'pointer', marginBottom: 20, fontFamily: "'IBM Plex Mono', monospace", padding: 0 }}>&larr; Back to agents</button>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <TrustGauge score={selectedAgent.trustScore} size={72} />
                  <div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>{selectedAgent.name}</h2>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: "'IBM Plex Mono', monospace", marginTop: 4 }}>{selectedAgent.id}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <StatusBadge status={selectedAgent.status} />
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: 'rgba(167,139,250,0.1)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.2)', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{getTrustLevel(selectedAgent.trustScore)}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div style={cardStyle}>
                <div style={{ ...labelStyle, marginBottom: 14 }}>Policies</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 3 }}>Max Transaction</div>
                    <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>{formatCurrency(selectedAgent.policies.maxTransactionAmount)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 3 }}>Daily Spend Limit</div>
                    <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>{formatCurrency(selectedAgent.policies.dailySpendLimit)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 3 }}>Capabilities</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {selectedAgent.capabilities.map(c => (
                        <span key={c} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', fontFamily: "'IBM Plex Mono', monospace" }}>{c}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 3 }}>Human Approval</div>
                    <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>
                      {selectedAgent.policies.requireHumanApproval ? `Above ${formatCurrency(selectedAgent.policies.requireHumanApproval.above)}` : 'Disabled'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ ...labelStyle, marginBottom: 14 }}>Transaction History</div>
              {agentTxns.length === 0 ? (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', padding: 20, textAlign: 'center' }}>No transactions for this agent</div>
              ) : agentTxns.map((txn, i) => (
                <div key={txn.id} className="row-hover" style={{ display: 'grid', gridTemplateColumns: '1.5fr 100px 100px 80px 80px', alignItems: 'center', padding: '12px 8px', borderBottom: i < agentTxns.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{txn.merchantUrl}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>{txn.intent}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>{formatCurrency(txn.amount)}</div>
                  <StatusBadge status={txn.status} />
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: "'IBM Plex Mono', monospace" }}>{txn.protocol}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'right' }}>{timeAgo(txn.createdAt)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TRANSACTIONS */}
        {view === 'transactions' && (
          <div className="fade-up">
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>Transactions</h2>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{transactions.length} transactions</p>
            </div>
            <div style={cardStyle}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 100px 100px 80px 80px', padding: '0 8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', gap: 12 }}>
                {['Description', 'Agent', 'Amount', 'Status', 'Protocol', 'Time'].map(h => (
                  <div key={h} style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'IBM Plex Mono', monospace" }}>{h}</div>
                ))}
              </div>
              {transactions.length === 0 && !loading ? (
                <div style={{ padding: 30, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No transactions yet</div>
              ) : transactions.map((txn, i) => (
                <div key={txn.id} className="row-hover" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 100px 100px 80px 80px', alignItems: 'center', padding: '12px 8px', borderBottom: i < transactions.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{txn.merchantUrl}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>{txn.id}</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: "'IBM Plex Mono', monospace" }}>{agentNameMap[txn.agentId] || txn.agentId.slice(0, 16)}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>{formatCurrency(txn.amount)}</div>
                  <StatusBadge status={txn.status} />
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: "'IBM Plex Mono', monospace" }}>{txn.protocol}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'right' }}>{timeAgo(txn.createdAt)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PROTOCOLS */}
        {view === 'protocols' && (
          <div className="fade-up">
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>Protocols</h2>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Supported agentic commerce protocols</p>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {[
                { name: 'Stripe ACP', key: 'stripe-acp', status: 'active', color: '#635bff', description: 'Agentic Commerce Protocol \u2014 works with any Stripe merchant', avgFee: '2.9% + $0.30' },
                { name: 'Coinbase x402', key: 'x402', status: 'active', color: '#0052ff', description: 'Crypto-native stablecoin payments for agent transactions', avgFee: '0.5% flat' },
                { name: 'Mastercard Agent Pay', key: 'mc-agent-pay', status: 'coming_soon', color: '#ff5f00', description: "Card network payments through Mastercard's agent infrastructure", avgFee: 'TBD' },
                { name: 'Google A2A', key: 'google-a2a', status: 'coming_soon', color: '#34a853', description: 'Agent-to-Agent protocol for discovery and transaction orchestration', avgFee: 'TBD' },
                { name: 'Mock', key: 'mock', status: 'active', color: '#64748b', description: 'Sandbox testing protocol \u2014 no real transactions', avgFee: 'Free' },
              ].map((proto, i) => {
                const txnCount = stats.protocolBreakdown[proto.key] || 0;
                return (
                  <div key={proto.key} className="card-hover fade-up" style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', alignItems: 'center', gap: 24, animationDelay: `${i * 0.05}s` }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: `${proto.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 16, height: 16, borderRadius: 4, background: proto.color }} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{proto.name}</span>
                        {proto.status === 'coming_soon' ? (
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>COMING SOON</span>
                        ) : (
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>ACTIVE</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{proto.description}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>{txnCount}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>transactions</div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 100 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>{proto.avgFee}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>avg fee</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
