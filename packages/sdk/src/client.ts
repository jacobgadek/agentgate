import type {
  AgentGateConfig,
  AgentIdentity,
  RegisterAgentRequest,
  TransactionRequest,
  TransactionResult,
  TrustScore,
  ProtocolAdapter,
} from '@agentgate/core';
import { SANDBOX_GATEWAY_URL, DEFAULT_GATEWAY_URL } from '@agentgate/core';
import { createAgentIdentity } from './identity/create.js';
import { verifyAgentIdentity } from './identity/verify.js';
import { TransactionRouter } from './transact/router.js';
import { executeTransaction } from './transact/execute.js';
import { computeTrustScore, applyTrustImpact } from './trust/score.js';
import { MockAdapter } from './adapters/mock.js';
import { Logger } from './utils/logger.js';
import { generateId } from './utils/crypto.js';
import { AgentNotFoundError } from './utils/errors.js';

export class AgentGate {
  private config: Required<Pick<AgentGateConfig, 'apiKey' | 'environment'>> & {
    gatewayUrl: string;
  };
  private agents: Map<string, AgentIdentity> = new Map();
  private dailySpend: Map<string, number> = new Map();
  private router: TransactionRouter;
  private logger: Logger;
  private developerId: string;

  /** Identity management namespace */
  public readonly identity: {
    register: (request: RegisterAgentRequest) => Promise<AgentIdentity>;
    get: (agentId: string) => AgentIdentity | undefined;
    verify: (agentId: string) => { valid: boolean; agent: AgentIdentity | null; reason?: string };
  };

  /** Trust score namespace */
  public readonly trust: {
    score: (agentId: string) => Promise<TrustScore>;
  };

  constructor(config: AgentGateConfig) {
    const environment = config.environment ?? 'sandbox';
    this.config = {
      apiKey: config.apiKey,
      environment,
      gatewayUrl:
        config.gatewayUrl ??
        (environment === 'sandbox' ? SANDBOX_GATEWAY_URL : DEFAULT_GATEWAY_URL),
    };

    this.logger = new Logger(environment === 'sandbox' ? 'debug' : 'info');
    this.developerId = generateId('dev');
    this.router = new TransactionRouter();

    // Register provided adapters, or default to mock in sandbox
    if (config.adapters && config.adapters.length > 0) {
      for (const adapter of config.adapters) {
        this.router.registerAdapter(adapter);
      }
    } else if (environment === 'sandbox') {
      this.router.registerAdapter(new MockAdapter());
    }

    // Bind namespace methods
    this.identity = {
      register: this.registerAgent.bind(this),
      get: (agentId: string) => this.agents.get(agentId),
      verify: (agentId: string) => verifyAgentIdentity(this.agents.get(agentId)),
    };

    this.trust = {
      score: this.getTrustScore.bind(this),
    };

    this.logger.info(`AgentGate initialized (${environment})`);
  }

  private async registerAgent(request: RegisterAgentRequest): Promise<AgentIdentity> {
    const agent = createAgentIdentity(request, this.developerId);
    this.agents.set(agent.id, agent);
    this.logger.info(`Agent registered: ${agent.name} (${agent.id})`);
    return agent;
  }

  async transact(request: TransactionRequest): Promise<TransactionResult> {
    const agent = this.agents.get(request.agentId);
    const dailySpent = this.dailySpend.get(request.agentId) ?? 0;

    this.logger.info(`Transaction request: ${request.intent} $${request.item.amount} ${request.item.currency}`);

    const result = await executeTransaction(request, agent, this.router, dailySpent);

    // Update local state on success
    if (result.status === 'completed' && agent) {
      agent.totalTransactions += 1;
      agent.trustScore = applyTrustImpact(agent.trustScore, result.trustImpact);
      this.dailySpend.set(request.agentId, dailySpent + request.item.amount);
      this.logger.info(`Transaction completed: ${result.id} via ${result.protocol}`);
    }

    return result;
  }

  private async getTrustScore(agentId: string): Promise<TrustScore> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new AgentNotFoundError(agentId);
    return computeTrustScore(agent);
  }

  /** Register a custom protocol adapter */
  registerAdapter(adapter: ProtocolAdapter): void {
    this.router.registerAdapter(adapter);
  }

  /** List registered protocol adapters */
  listProtocols(): string[] {
    return this.router.listAdapters();
  }
}
