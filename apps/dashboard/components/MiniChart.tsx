'use client';

interface DataPoint { label: string; value: number }

export function MiniChart({ data, height = 48 }: { data: DataPoint[]; height?: number }) {
  if (data.length === 0) return <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No data</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  const w = 200;
  const pts = data.map((d, i) => `${(i / Math.max(data.length - 1, 1)) * w},${height - (d.value / max) * (height - 8)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.3} />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts} ${w},${height}`} fill="url(#chartGrad)" />
      <polyline points={pts} fill="none" stroke="#a78bfa" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => (
        <circle key={i} cx={(i / Math.max(data.length - 1, 1)) * w} cy={height - (d.value / max) * (height - 8)} r={2.5} fill="#a78bfa" />
      ))}
    </svg>
  );
}
