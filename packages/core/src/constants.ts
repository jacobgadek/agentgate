/** SDK version */
export const SDK_VERSION = '0.1.0';

/** Default gateway URL */
export const DEFAULT_GATEWAY_URL = 'https://api.agentgate.dev';

/** Sandbox gateway URL */
export const SANDBOX_GATEWAY_URL = 'http://localhost:3100';

/** API key prefix */
export const API_KEY_PREFIX = 'ag_dev_';

/** Trust score bounds */
export const TRUST_SCORE_MIN = 0;
export const TRUST_SCORE_MAX = 100;
export const TRUST_SCORE_INITIAL = 50;

/** Trust levels and their thresholds */
export const TRUST_LEVELS = {
  new: { min: 0, max: 29 },
  established: { min: 30, max: 59 },
  trusted: { min: 60, max: 84 },
  verified: { min: 85, max: 100 },
} as const;

/** Transaction statuses */
export const TRANSACTION_STATUSES = [
  'completed',
  'pending_approval',
  'rejected',
  'failed',
  'processing',
] as const;

/** Rate limits (requests per minute) */
export const RATE_LIMITS = {
  free: 60,
  pro: 600,
  enterprise: 6000,
} as const;

/** Supported currencies */
export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP'] as const;
