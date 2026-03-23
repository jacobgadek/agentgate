'use client';

const configs: Record<string, { bg: string; color: string; border: string }> = {
  completed: { bg: 'rgba(34,197,94,0.1)', color: '#22c55e', border: 'rgba(34,197,94,0.2)' },
  pending_approval: { bg: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: 'rgba(251,191,36,0.2)' },
  failed: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'rgba(239,68,68,0.2)' },
  rejected: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'rgba(239,68,68,0.2)' },
  processing: { bg: 'rgba(167,139,250,0.1)', color: '#a78bfa', border: 'rgba(167,139,250,0.2)' },
  active: { bg: 'rgba(34,197,94,0.1)', color: '#22c55e', border: 'rgba(34,197,94,0.2)' },
  suspended: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'rgba(239,68,68,0.2)' },
  revoked: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'rgba(239,68,68,0.2)' },
};

export function StatusBadge({ status }: { status: string }) {
  const c = configs[status] || { bg: 'rgba(148,163,184,0.1)', color: '#94a3b8', border: 'rgba(148,163,184,0.2)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase',
      fontFamily: "'IBM Plex Mono', monospace",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.color }} />
      {status.replace('_', ' ')}
    </span>
  );
}
