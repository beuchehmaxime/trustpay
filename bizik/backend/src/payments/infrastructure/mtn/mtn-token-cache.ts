interface CachedAccessToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

/**
 * Caches MTN OAuth access tokens per product (collection / disbursement) so we
 * don't mint a new token on every payment. Tokens are refreshed 60s before their
 * real expiry to avoid using one that lapses mid-request.
 */
export class MtnAccessTokenCache {
  private tokens = new Map<string, CachedAccessToken>();

  get(product: 'collection' | 'disbursement'): string | undefined {
    const cached = this.tokens.get(product);
    if (!cached) return undefined;
    if (Date.now() >= cached.expiresAt) {
      this.tokens.delete(product);
      return undefined;
    }
    return cached.accessToken;
  }

  save(product: 'collection' | 'disbursement', accessToken: string, expiresInSeconds: number): void {
    this.tokens.set(product, {
      accessToken,
      expiresAt: Date.now() + Math.max(0, expiresInSeconds - 60) * 1000,
    });
  }
}
