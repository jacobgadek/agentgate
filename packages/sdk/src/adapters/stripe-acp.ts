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
import Stripe from 'stripe';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { generateId } from '../utils/crypto.js';

// ── Config ──────────────────────────────────────────────────

export interface StripeACPConfig {
  /** Stripe secret key (sk_test_... or sk_live_...) */
  stripeSecretKey: string;
  /** Default currency for transactions (defaults to 'usd') */
  defaultCurrency?: string;
  /** Webhook signing secret for verifying seller events */
  webhookSecret?: string;
  /** Request timeout in milliseconds (defaults to 30000) */
  timeout?: number;
  /** Override Stripe API base URL (for testing) */
  stripeBaseUrl?: string;
}

// ── ACP Protocol Types (per spec 2026-01-30) ────────────────

interface ACPBuyer {
  name: string;
  email?: string;
  phone?: string;
}

interface ACPItem {
  id: string;
  quantity: number;
}

interface ACPLineItem {
  id: string;
  item: ACPItem;
  base_amount: number;
  discount: number;
  subtotal: number;
  tax: number;
  total: number;
}

interface ACPAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

interface ACPFulfillmentOption {
  id: string;
  label: string;
  amount: number;
  estimated_delivery?: string;
}

interface ACPTotal {
  type: 'subtotal' | 'shipping' | 'tax' | 'discount' | 'total';
  display_text: string;
  amount: number;
}

interface ACPPaymentProvider {
  provider: string;
  supported_payment_methods: string[];
}

interface ACPMessage {
  type: 'info' | 'error';
  content: string;
  code?: string;
}

interface ACPOrder {
  id: string;
  checkout_session_id: string;
  status?: string;
  permalink_url: string;
}

interface ACPLink {
  url: string;
  rel: string;
  type?: string;
}

export type ACPCheckoutStatus =
  | 'not_ready_for_payment'
  | 'ready_for_payment'
  | 'in_progress'
  | 'completed'
  | 'canceled';

export interface ACPCheckoutSession {
  id: string;
  status: ACPCheckoutStatus;
  buyer?: ACPBuyer;
  line_items: ACPLineItem[];
  totals: ACPTotal[];
  fulfillment_options?: ACPFulfillmentOption[];
  selected_fulfillment_option?: string;
  shipping_address?: ACPAddress;
  payment_provider: ACPPaymentProvider;
  order?: ACPOrder;
  messages?: ACPMessage[];
  links?: ACPLink[];
}

interface ACPPaymentData {
  token: string;
  provider: string;
}

// ── Error Types ─────────────────────────────────────────────

export class StripeACPError extends Error {
  constructor(
    message: string,
    public readonly step: 'create' | 'update' | 'spt' | 'complete' | 'retrieve' | 'cancel' | 'webhook',
    public readonly statusCode?: number,
    public readonly sellerMessage?: string,
  ) {
    super(message);
    this.name = 'StripeACPError';
  }
}

// ── Stripe ACP Adapter ──────────────────────────────────────

export class StripeACPAdapter implements ProtocolAdapter {
  name: ProtocolName = 'stripe-acp';
  private stripe: Stripe;
  private defaultCurrency: string;
  private webhookSecret: string;
  private timeout: number;
  private stripeBaseUrl: string;
  private stripeSecretKey: string;

  constructor(config: StripeACPConfig) {
    this.stripeSecretKey = config.stripeSecretKey;
    this.defaultCurrency = config.defaultCurrency ?? 'usd';
    this.webhookSecret = config.webhookSecret ?? '';
    this.timeout = config.timeout ?? 30_000;
    this.stripeBaseUrl = config.stripeBaseUrl ?? 'https://api.stripe.com';

    // Use a placeholder key if none provided — isAvailable() will return false
    const effectiveKey = config.stripeSecretKey || 'sk_none_placeholder';
    this.stripe = new Stripe(effectiveKey, {
      apiVersion: '2025-12-18.acacia' as Stripe.LatestApiVersion,
      ...(config.stripeBaseUrl ? { host: new URL(config.stripeBaseUrl).hostname, port: Number(new URL(config.stripeBaseUrl).port) || undefined, protocol: new URL(config.stripeBaseUrl).protocol.replace(':', '') as 'http' | 'https' } : {}),
    });
  }

  // ── ProtocolAdapter Interface ─────────────────────────────

  async isAvailable(): Promise<boolean> {
    return (
      !!this.stripeSecretKey &&
      (this.stripeSecretKey.startsWith('sk_test_') ||
        this.stripeSecretKey.startsWith('sk_live_'))
    );
  }

  supportsIntent(intent: TransactionIntent): boolean {
    return intent === 'purchase' || intent === 'subscribe';
  }

  async estimateFee(txn: TransactionRequest): Promise<FeeEstimate> {
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
      const sellerBase = this.resolveSellerUrl(request.item.merchantUrl);

      // Step 1: Create checkout session with the seller
      const session = await this.createCheckout(sellerBase, request);

      // Step 2: Update with buyer details and shipping if needed
      const updated = await this.updateCheckout(sellerBase, session.id, {
        buyer: {
          name: agent.owner ?? agent.name,
          email: `${agent.name}@agentgate.dev`,
        },
        ...(session.fulfillment_options?.length
          ? { selected_fulfillment_option: session.fulfillment_options[0].id }
          : {}),
      });

      // Check if seller is ready for payment
      if (updated.status !== 'ready_for_payment' && updated.status !== 'not_ready_for_payment') {
        // Seller rejected or session is in unexpected state
        const errorMsg = updated.messages?.find(m => m.type === 'error')?.content;
        throw new StripeACPError(
          `Seller not ready for payment: status=${updated.status}${errorMsg ? ` (${errorMsg})` : ''}`,
          'update',
        );
      }

      // Step 3: Provision a SharedPaymentToken via Stripe API
      const totalAmount = this.extractTotal(updated);
      const sptAmount = totalAmount > 0 ? totalAmount : Math.round(request.item.amount * 100);
      const currency = request.item.currency.toLowerCase() || this.defaultCurrency;

      const spt = await this.createSharedPaymentToken({
        amount: sptAmount,
        currency,
        merchantUrl: request.item.merchantUrl,
      });

      // Step 4: Complete the checkout with the payment token
      const completed = await this.completeCheckout(sellerBase, updated.id, {
        token: spt.id,
        provider: 'stripe',
      });

      if (completed.status !== 'completed') {
        const errorMsg = completed.messages?.find(m => m.type === 'error')?.content;
        throw new StripeACPError(
          `Checkout completion failed: status=${completed.status}${errorMsg ? ` (${errorMsg})` : ''}`,
          'complete',
        );
      }

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
            orderStatus: completed.order?.status,
            paymentTokenId: spt.id,
            provider: 'stripe',
            totals: completed.totals,
            lineItems: completed.line_items.length,
          },
        },
        trustImpact: 2,
        policyCheck,
        createdAt: now,
        completedAt: now,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const step = error instanceof StripeACPError ? error.step : 'unknown';

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

    const sellerBase = receipt.merchantUrl
      ? this.resolveSellerUrl(receipt.merchantUrl)
      : this.stripeBaseUrl;

    try {
      const session = await this.getCheckout(sellerBase, sessionId);
      return {
        valid: session.status === 'completed',
        protocol: 'stripe-acp',
        timestamp: new Date().toISOString(),
        details: {
          sessionId: session.id,
          status: session.status,
          orderId: session.order?.id,
          orderStatus: session.order?.status,
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

  // ── ACP Endpoints (per spec) ──────────────────────────────

  /**
   * POST /checkouts — Create a new checkout session with the seller.
   */
  async createCheckout(
    sellerBase: string,
    request: TransactionRequest,
  ): Promise<ACPCheckoutSession> {
    const body = {
      items: [
        {
          id: request.item.description || request.item.merchantUrl,
          quantity: 1,
        },
      ],
      ...(request.metadata ? { metadata: request.metadata } : {}),
    };

    const res = await this.sellerRequest<ACPCheckoutSession>(
      'POST',
      `${sellerBase}/checkouts`,
      body,
      'create',
    );
    return res;
  }

  /**
   * PUT /checkouts/:id — Update an existing checkout session.
   */
  async updateCheckout(
    sellerBase: string,
    sessionId: string,
    data: {
      buyer?: ACPBuyer;
      shipping_address?: ACPAddress;
      selected_fulfillment_option?: string;
    },
  ): Promise<ACPCheckoutSession> {
    return this.sellerRequest<ACPCheckoutSession>(
      'PUT',
      `${sellerBase}/checkouts/${sessionId}`,
      data,
      'update',
    );
  }

  /**
   * POST /checkouts/:id/complete — Complete checkout with payment data.
   */
  async completeCheckout(
    sellerBase: string,
    sessionId: string,
    paymentData: ACPPaymentData,
  ): Promise<ACPCheckoutSession> {
    return this.sellerRequest<ACPCheckoutSession>(
      'POST',
      `${sellerBase}/checkouts/${sessionId}/complete`,
      { payment_data: paymentData },
      'complete',
    );
  }

  /**
   * GET /checkouts/:id — Retrieve a checkout session.
   */
  async getCheckout(
    sellerBase: string,
    sessionId: string,
  ): Promise<ACPCheckoutSession> {
    return this.sellerRequest<ACPCheckoutSession>(
      'GET',
      `${sellerBase}/checkouts/${sessionId}`,
      undefined,
      'retrieve',
    );
  }

  /**
   * POST /checkouts/:id/cancel — Cancel a checkout session.
   */
  async cancelCheckout(
    sellerBase: string,
    sessionId: string,
    reason?: string,
  ): Promise<ACPCheckoutSession> {
    return this.sellerRequest<ACPCheckoutSession>(
      'POST',
      `${sellerBase}/checkouts/${sessionId}/cancel`,
      reason ? { reason } : {},
      'cancel',
    );
  }

  // ── SharedPaymentToken (via Stripe API) ───────────────────

  /**
   * Provision a SharedPaymentToken scoped to this transaction.
   * Uses test_helpers endpoint in test mode, production endpoint in live mode.
   */
  private async createSharedPaymentToken(params: {
    amount: number;
    currency: string;
    merchantUrl: string;
  }): Promise<{ id: string; created: number; usage_limits: { currency: string; max_amount: number; expires_at: number } }> {
    const isTestMode = this.stripeSecretKey.startsWith('sk_test_');
    const endpoint = isTestMode
      ? '/v1/test_helpers/shared_payment/granted_tokens'
      : '/v1/shared_payment/granted_tokens';

    const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour

    const body = new URLSearchParams({
      'usage_limits[currency]': params.currency,
      'usage_limits[max_amount]': String(params.amount),
      'usage_limits[expires_at]': String(expiresAt),
      'seller_details[external_id]': params.merchantUrl,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.stripeBaseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new StripeACPError(
          `SPT creation failed (${res.status}): ${errBody}`,
          'spt',
          res.status,
        );
      }

      return res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Webhook Verification ──────────────────────────────────

  /**
   * Verify an HMAC signature on an incoming webhook event from a seller.
   * Returns the parsed event body if valid, throws if invalid.
   */
  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    secret?: string,
  ): Record<string, unknown> {
    const signingSecret = secret || this.webhookSecret;
    if (!signingSecret) {
      throw new StripeACPError('No webhook secret configured', 'webhook');
    }

    const payloadStr = typeof payload === 'string' ? payload : payload.toString('utf8');

    // Signature format: t=<timestamp>,v1=<hmac>
    const parts = signature.split(',').reduce<Record<string, string>>((acc, part) => {
      const [key, val] = part.split('=', 2);
      acc[key] = val;
      return acc;
    }, {});

    const timestamp = parts['t'];
    const v1 = parts['v1'];
    if (!timestamp || !v1) {
      throw new StripeACPError('Invalid signature format', 'webhook');
    }

    // Reject events older than 5 minutes
    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (age > 300) {
      throw new StripeACPError('Webhook timestamp too old', 'webhook');
    }

    const signedPayload = `${timestamp}.${payloadStr}`;
    const expected = createHmac('sha256', signingSecret)
      .update(signedPayload)
      .digest('hex');

    const expectedBuf = Buffer.from(expected, 'utf8');
    const actualBuf = Buffer.from(v1, 'utf8');

    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      throw new StripeACPError('Invalid webhook signature', 'webhook');
    }

    return JSON.parse(payloadStr);
  }

  // ── Internal Helpers ──────────────────────────────────────

  private buildHeaders(method: string, body?: unknown): Record<string, string> {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const idempotencyKey = randomUUID();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.stripeSecretKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      'User-Agent': 'AgentGate/0.1.0 (agentic-commerce-protocol)',
    };

    // Only add idempotency for non-GET requests
    if (method === 'GET') {
      delete headers['Idempotency-Key'];
    }

    return headers;
  }

  private async sellerRequest<T>(
    method: string,
    url: string,
    body: unknown | undefined,
    step: StripeACPError['step'],
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, {
        method,
        headers: this.buildHeaders(method, body),
        ...(body && method !== 'GET' ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        let sellerMessage: string | undefined;
        try {
          const errJson = JSON.parse(errText);
          sellerMessage = errJson.error || errJson.message;
        } catch { /* not json */ }

        throw new StripeACPError(
          `ACP ${step} failed (${res.status}): ${errText}`,
          step,
          res.status,
          sellerMessage,
        );
      }

      return res.json() as Promise<T>;
    } catch (error) {
      if (error instanceof StripeACPError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new StripeACPError(`Request timed out after ${this.timeout}ms`, step);
      }
      throw new StripeACPError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        step,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Extract the total amount in cents from a checkout session's totals array.
   */
  private extractTotal(session: ACPCheckoutSession): number {
    const total = session.totals.find(t => t.type === 'total');
    return total?.amount ?? 0;
  }

  /**
   * Resolve a merchant/seller URL to their ACP API base.
   * Convention: {protocol}://{host}/acp
   */
  private resolveSellerUrl(merchantUrl: string): string {
    try {
      const url = new URL(merchantUrl);
      return `${url.protocol}//${url.host}/acp`;
    } catch {
      return merchantUrl;
    }
  }
}
