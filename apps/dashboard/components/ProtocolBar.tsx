'use client';

const PROTOCOL_COLORS: Record<string, string> = {
  'stripe-acp': '#635bff',
  'x402': '#0052ff',
  'mc-agent-pay': '#ff5f00',
  'mock': '#64748b',
  'none': '#333',
  'pending': '#fbbf24',
};

export function ProtocolBar({ breakdown }: { breakdown: Record<string, number> }) {
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  if (total === 0) {
    return <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No transactions yet</div>;
  }
  return (
    <div>
      <div style={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden', gap: 2 }}>
        {Object.entries(breakdown).map(([name, val]) => (
          <div key={name} style={{ flex: val, background: PROTOCOL_COLORS[name] || '#64748b', borderRadius: 99, transition: 'flex 0.5s ease' }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
        {Object.entries(breakdown).map(([name, val]) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: PROTOCOL_COLORS[name] || '#64748b' }} />
            <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{name}</span>
            <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{Math.round((val / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
