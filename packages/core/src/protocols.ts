/**
 * Supported agentic commerce protocols.
 */
export enum Protocol {
  STRIPE_ACP = 'stripe-acp',
  X402 = 'x402',
  MC_AGENT_PAY = 'mc-agent-pay',
  GOOGLE_A2A = 'google-a2a',
  MOCK = 'mock',
}

export type ProtocolName = `${Protocol}`;

export const PROTOCOL_METADATA: Record<
  Protocol,
  { displayName: string; description: string; status: 'available' | 'coming_soon' | 'mock' }
> = {
  [Protocol.STRIPE_ACP]: {
    displayName: 'Stripe Agentic Commerce Protocol',
    description: 'Stripe\'s protocol for agent-initiated payments',
    status: 'coming_soon',
  },
  [Protocol.X402]: {
    displayName: 'Coinbase x402',
    description: 'HTTP 402-based micropayment protocol by Coinbase',
    status: 'coming_soon',
  },
  [Protocol.MC_AGENT_PAY]: {
    displayName: 'Mastercard Agent Pay',
    description: 'Mastercard\'s agent payment rail',
    status: 'coming_soon',
  },
  [Protocol.GOOGLE_A2A]: {
    displayName: 'Google Agent-to-Agent',
    description: 'Google\'s A2A protocol for inter-agent communication',
    status: 'coming_soon',
  },
  [Protocol.MOCK]: {
    displayName: 'Mock Protocol',
    description: 'Simulated protocol for sandbox testing',
    status: 'mock',
  },
};
