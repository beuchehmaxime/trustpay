import axios from 'axios';

import { MtnConfiguration } from './mtn.config';
import { MtnAccessTokenCache } from './mtn-token-cache';

/**
 * Mints and caches MTN OAuth access tokens. Each product (collection /
 * disbursement) authenticates with Basic auth of `userId:apiKey` plus its own
 * subscription key, and returns a short-lived bearer token.
 * Docs: MTN MoMo `POST /{product}/token/`.
 */
export class MtnAuthenticationService {
  constructor(
    private readonly mtnConfiguration: MtnConfiguration,
    private readonly tokenCache: MtnAccessTokenCache,
  ) {}

  async getCollectionToken(): Promise<string> {
    return this.getToken('collection', this.mtnConfiguration.collection);
  }

  async getDisbursementToken(): Promise<string> {
    return this.getToken('disbursement', this.mtnConfiguration.disbursement);
  }

  private async getToken(
    product: 'collection' | 'disbursement',
    credentials: { userId: string; apiKey: string; subscriptionKey: string },
  ): Promise<string> {
    const cached = this.tokenCache.get(product);
    if (cached) return cached;

    const basicAuth = Buffer.from(`${credentials.userId}:${credentials.apiKey}`).toString('base64');
    const { data } = await axios.post<{ access_token: string; expires_in: number }>(
      `${this.mtnConfiguration.baseUrl}/${product}/token/`,
      {},
      {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Ocp-Apim-Subscription-Key': credentials.subscriptionKey,
        },
        timeout: 15000,
      },
    );

    this.tokenCache.save(product, data.access_token, data.expires_in ?? 3000);
    return data.access_token;
  }
}
