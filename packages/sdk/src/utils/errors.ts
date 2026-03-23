export class AgentGateError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = 'AgentGateError';
  }
}

export class PolicyViolationError extends AgentGateError {
  constructor(
    message: string,
    public violations: Array<{ rule: string; message: string }>,
  ) {
    super(message, 'POLICY_VIOLATION', 403);
    this.name = 'PolicyViolationError';
  }
}

export class AdapterNotFoundError extends AgentGateError {
  constructor(protocol: string) {
    super(`No adapter found for protocol: ${protocol}`, 'ADAPTER_NOT_FOUND', 404);
    this.name = 'AdapterNotFoundError';
  }
}

export class AgentNotFoundError extends AgentGateError {
  constructor(agentId: string) {
    super(`Agent not found: ${agentId}`, 'AGENT_NOT_FOUND', 404);
    this.name = 'AgentNotFoundError';
  }
}
