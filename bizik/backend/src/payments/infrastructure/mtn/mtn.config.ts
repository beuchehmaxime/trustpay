import { config } from '../../../config/env';

/** MTN MoMo adapter configuration, resolved from the central env config. */
export interface MtnProductCredentials {
  subscriptionKey: string;
  userId: string;
  apiKey: string;
}

export interface MtnConfiguration {
  baseUrl: string;
  /** MTN "X-Target-Environment": sandbox | mtncameroon | production … */
  environment: string;
  callbackUrl: string;
  collection: MtnProductCredentials;
  disbursement: MtnProductCredentials;
}

/** Read MTN config from env (see config.payments.mtn). */
export function getMtnConfiguration(): MtnConfiguration {
  const mtn = config.payments.mtn;
  const callbackBase = config.payments.callbackBaseUrl.replace(/\/+$/, '');
  return {
    baseUrl: mtn.baseUrl.replace(/\/+$/, ''),
    environment: mtn.environment,
    callbackUrl: callbackBase ? `${callbackBase}/api/v1/payments/webhooks/mtn` : '',
    collection: { ...mtn.collection },
    disbursement: { ...mtn.disbursement },
  };
}

/** A product is usable only when its three credentials are present. */
export function isProductConfigured(credentials: MtnProductCredentials): boolean {
  return Boolean(credentials.subscriptionKey && credentials.userId && credentials.apiKey);
}
