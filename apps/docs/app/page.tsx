import Link from 'next/link';

export default function HomePage() {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: '1.5rem',
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      <h1 style={{ fontSize: '3rem', fontWeight: 800 }}>AgentGate</h1>
      <p style={{ fontSize: '1.25rem', maxWidth: '600px', opacity: 0.8 }}>
        One SDK. Every agentic payment rail. Identity, policies, trust scoring,
        and protocol routing for AI agent transactions.
      </p>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <Link
          href="/docs/quickstart"
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: '8px',
            background: '#0070f3',
            color: 'white',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Get Started
        </Link>
        <Link
          href="/docs"
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: '8px',
            border: '1px solid #333',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Documentation
        </Link>
      </div>
    </main>
  );
}
