import type {
  ProtocolAdapter,
  FeeEstimate,
  VerificationResult,
  TransactionRequest,
  TransactionResult,
  TransactionReceipt,
  ValidatedTransaction,
  TransactionIntent,
  ProtocolName,
  Currency,
} from '@agentgate/core';
import { createHash, randomUUID } from 'node:crypto';
import { generateId } from '../utils/crypto.js';

// ── ACP Types ───────────────────────────────────────────────

export interface StripeACPConfig {
  /** Stripe secret key (sk_test_... or sk_live_...) */
  stripeSecretKey: string;
  /** API version for ACP protocol */
  acpApiVersion?: string;
  /** Base URL for Stripe API */
  stripeBaseUrl?: string;
  /** HMAC signing secret for request signatures */
  signingSecret?: string;
}

interface ACPCheckoutSession {
  id: string;
  status: 'not_ready_for_payment' | 'ready_for_payment' | 'completed' | 'canceled' | 'in_progress';
  line_items: ACPLineItem[];
  totals: ACPTotal[];
  payment_provider: { provider: string; supported_payment_methods: string[] };
  order?: { id: string; checkout_session_id: string; permalink_url: string };
  messages?: ACPMessage[];
}

interface ACPLineItem {
  id: string;
  item: { id: string; quantity: number };
  base_amount: number;
  discount: number;
  subtotal: number;
  tax: number;
  total: number;
}

interface ACPTotal {
  type: string;
  display_text: string;
  amount: number;
}

interface ACPMessage {
  type: 'info' | 'error';
  content: string;
  code?: string;
}

interface SharedPaymentToken {
  id: string;
  created: number;
  usage_limits: {
    currency: string;
    max_amount: number;
    expires_at: number;
  };
}

// ── Stripe ACP Adapter ─────────────────────────────────────

export class StripeACPAdapter implements ProtocolAdapter {
  name: ProtocolName = 'stripe-acp';
  private config: Required<StripeACPConfig>;

  constructor(config: StripeACPConfig) {
    this.config = {
      stripeSecretKey: config.stripeSecretKey,
      acpApiVersion: config.acpApiVersion ?? '2025-09-12',
      stripeBaseUrl: config.stripeBaseUrl ?? 'https://api.stripe.com',
      signingSecret: config.signingSecret ?? '',
    };
  }

  async isAvailable(): Promise<boolean> {
    // Verify the Stripe key is present and looks valid
    return (
      !!this.config.stripeSecretKey &&
      (this.config.stripeSecretKey.startsWith('sk_test_') ||
        this.config.stripeSecretKey.startsWith('sk_live_'))
    );
  }

  supportsIntent(intent: TransactionIntent): boolean {
    // ACP supports purchase and subscribe intents
    return intent === 'purchase' || intent === 'subscribe';
  }

  async estimateFee(txn: TransactionRequest): Promise<FeeEstimate> {
    // Stripe's standard fee: 2.9% + $0.30
    const percentageFee = 0.029;
    const fixedFee = 0.30;
    const feeAmount = txn.item.amount * percentageFee + fixedFee;

    return {
      protocol: 'stripe-acp',
      fixedFee,
      percentageFee,
      estimatedTotal: txn.item.amount + feeAmount,
      currency: txn.item.currency,
    };
  }

  async execute(txn: ValidatedTransaction): Promise<TransactionResult> {
    const { request, agent, policyCheck } = txn;
    const now = new Date().toISOString();
    const txnId = generateId('txn');

    try {
      const merchantBase = this.resolveMerchantUrl(request.item.merchantUrl);

      // Step 1: Create ACP Checkout Session with the merchant
      const checkoutSession = await this.createCheckoutSession(merchantBase, request);

      // Step 2: If session requires payment, provision a SharedPaymentToken
      if (
        checkoutSession.status === 'ready_for_payment' ||
        checkoutSession.status === 'not_ready_for_payment'
      ) {
        // Update session with buyer details
        await this.updateCheckoutSession(merchantBase, checkoutSession.id, {
          buyer: {
            name: agent.owner,
            email: `${agent.owner}@agentgate.dev`,
          },
        });

        // Create a scoped SharedPaymentToken (this calls Stripe, not the merchant)
        const spt = await this.createSharedPaymentToken({
          amount: Math.round(request.item.amount * 100), // Convert to cents
          currency: request.item.currency.toLowerCase(),
          merchantUrl: request.item.merchantUrl,
        });

        // Step 3: Complete the checkout with the payment token
        const completed = await this.completeCheckout(merchantBase, checkoutSession.id, {
          token: spt.id,
          provider: 'stripe',
        });

        // Step 4: Build receipt from the completed session
        return {
          id: txnId,
          agentId: request.agentId,
          status: 'completed',
          protocol: 'stripe-acp',
          receipt: {
            transactionId: txnId,
            protocol: 'stripe-acp',
            amount: request.item.amount,
            currency: request.item.currency,
            merchantUrl: request.item.merchantUrl,
            timestamp: now,
            protocolData: {
              checkoutSessionId: completed.id,
              orderId: completed.order?.id,
              orderUrl: completed.order?.permalink_url,
              paymentTokenId: spt.id,
              provider: 'stripe',
            },
          },
          trustImpact: 2,
          policyCheck,
          createdAt: now,
          completedAt: now,
        };
      }

      // Session created but in unexpected state
      return {
        id: txnId,
        agentId: request.agentId,
        status: 'processing',
        protocol: 'stripe-acp',
        receipt: null,
        trustImpact: 0,
        policyCheck,
        createdAt: now,
        completedAt: null,
      };
    } catch (error: any) {
      return {
        id: txnId,
        agentId: request.agentId,
        status: 'failed',
        protocol: 'stripe-acp',
        receipt: null,
        trustImpact: -2,
        policyCheck,
        createdAt: now,
        completedAt: now,
      };
    }
  }

  async verify(receipt: TransactionReceipt): Promise<VerificationResult> {
    if (receipt.protocol !== 'stripe-acp') {
      return { valid: false, protocol: 'stripe-acp', timestamp: new Date().toISOString() };
    }

    const sessionId = receipt.protocolData?.checkoutSessionId as string | undefined;
    if (!sessionId) {
      return {
        valid: false,
        protocol: 'stripe-acp',
        timestamp: new Date().toISOString(),
        details: { reason: 'Missing checkoutSessionId in receipt' },
      };
    }

    const merchantBase = receipt.merchantUrl
      ? this.resolveMerchantUrl(receipt.merchantUrl)
      : this.config.stripeBaseUrl;

    try {
      const session = await this.retrieveCheckoutSession(merchantBase, sessionId);
      return {
        valid: session.status === 'completed',
        protocol: 'stripe-acp',
        timestamp: new Date().toISOString(),
        details: {
          sessionId: session.id,
          status: session.status,
          orderId: session.order?.id,
        },
      };
    } catch {
      return {
        valid: false,
        protocol: 'stripe-acp',
        timestamp: new Date().toISOString(),
        details: { reason: 'Failed to retrieve checkout session' },
      };
    }
  }

  // ── ACP Protocol Methods ────────────────────────────────

  private buildHeaders(body?: unknown): Record<string, string> {
    const timestamp = new Date().toISOString();
    const idempotencyKey = randomUUID();
    const requestId = randomUUID();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.stripeSecretKey}`,
      'Content-Type': 'application/json',
      'API-Version': this.config.acpApiVersion,
      'Idempotency-Key': idempotencyKey,
      'Request-Id': requestId,
      Timestamp: timestamp,
      'User-Agent': `AgentGate/0.1.0 (agentic-commerce-protocol)`,
    };

    // Add HMAC signature if signing secret is configured
    if (this.config.signingSecret && body) {
      const payload = JSON.stringify(body);
      const signature = createHash('sha256')
        .update(payload + timestamp + this.config.signingSecret)
        .digest('base64');
      headers['Signature'] = signature;
    }

    return headers;
  }

  /**
   * Step 1: Create a checkout session with the merchant.
   * POST /checkout_sessions
   */
  private async createCheckoutSession(
    merchantBase: string,
    request: TransactionRequest,
  ): Promise<ACPCheckoutSession> {
    const body = {
      items: [
        {
          id: request.item.merchantUrl, // merchant product identifier
          quantity: 1,
        },
      ],
      metadata: request.metadata,
    };

    const response = await fetch(
      `${merchantBase}/checkout_sessions`,
      {
        method: 'POST',
        headers: this.buildHeaders(body),
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ACP CreateCheckout failed (${response.status}): ${error}`);
    }

    return response.json() as Promise<ACPCheckoutSession>;
  }

  /**
   * Step 2: Update checkout session with buyer details.
   * POST /checkout_sessions/{id}
   */
  private async updateCheckoutSession(
    merchantBase: string,
    sessionId: string,
    data: { buyer: { name: string; email: string } },
  ): Promise<ACPCheckoutSession> {
    const response = await fetch(
      `${merchantBase}/checkout_sessions/${sessionId}`,
      {
        method: 'POST',
        headers: this.buildHeaders(data),
        body: JSON.stringify(data),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ACP UpdateCheckout failed (${response.status}): ${error}`);
    }

    return response.json() as Promise<ACPCheckoutSession>;
  }

  /**
   * Step 3: Create a SharedPaymentToken (SPT) scoped to this transaction.
   * POST /v1/test_helpers/shared_payment/granted_tokens (test mode)
   * or POST /v1/shared_payment/granted_tokens (live mode)
   */
  private async createSharedPaymentToken(params: {
    amount: number;
    currency: string;
    merchantUrl: string;
  }): Promise<SharedPaymentToken> {
    const isTestMode = this.config.stripeSecretKey.startsWith('sk_test_');
    const endpoint = isTestMode
      ? '/v1/test_helpers/shared_payment/granted_tokens'
      : '/v1/shared_payment/granted_tokens';

    const body = new URLSearchParams({
      'usage_limits[currency]': params.currency,
      'usage_limits[max_amount]': String(params.amount),
      'usage_limits[expires_at]': String(Math.floor(Date.now() / 1000) + 3600), // 1 hour
      'seller_details[external_id]': params.merchantUrl,
    });

    const response = await fetch(`${this.config.stripeBaseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Stripe SPT creation failed (${response.status}): ${error}`);
    }

    return response.json() as Promise<SharedPaymentToken>;
  }

  /**
   * Step 4: Complete the checkout session with the payment token.
   * POST /checkout_sessions/{id}/complete
   */
  private async completeCheckout(
    merchantBase: string,
    sessionId: string,
    paymentData: { token: string; provider: string },
  ): Promise<ACPCheckoutSession> {
    const body = { payment_data: paymentData };

    const response = await fetch(
      `${merchantBase}/checkout_sessions/${sessionId}/complete`,
      {
        method: 'POST',
        headers: this.buildHeaders(body),
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ACP CompleteCheckout failed (${response.status}): ${error}`);
    }

    return response.json() as Promise<ACPCheckoutSession>;
  }

  /**
   * Retrieve a checkout session (for verification).
   * GET /checkout_sessions/{id}
   */
  private async retrieveCheckoutSession(
    merchantBase: string,
    sessionId: string,
  ): Promise<ACPCheckoutSession> {
    const response = await fetch(
      `${merchantBase}/checkout_sessions/${sessionId}`,
      {
        method: 'GET',
        headers: this.buildHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(`ACP RetrieveCheckout failed (${response.status})`);
    }

    return response.json() as Promise<ACPCheckoutSession>;
  }

  /**
   * Extract a base merchant API URL from a product URL.
   * In production, this would resolve via a merchant registry or the URL itself.
   */
  private resolveMerchantUrl(merchantUrl: string): string {
    try {
      const url = new URL(merchantUrl);
      return `${url.protocol}//${url.host}/acp`;
    } catch {
      return merchantUrl;
    }
  }
}
