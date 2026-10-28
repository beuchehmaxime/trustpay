import { config } from '../../config/env';
import { SmsProvider, SmsSendResult, maskNumber } from './types';

/**
 * Orange SMS API (Africa & Middle East / SMS Cameroon).
 *
 * Chosen as the Cameroon rail because it delivers to every local operator from
 * a local short code, is paid for in FCFA bundles, and does not carry the
 * international-route filtering that makes a US long code unreliable here.
 *
 * Shape of the integration, from Orange's documentation:
 *  - OAuth2 client_credentials against /oauth/v3/token; the token lasts an hour
 *    and must be REUSED, not minted per message.
 *  - POST /smsmessaging/v1/outbound/{senderAddress}/requests, where the sender
 *    address is a country short code (Cameroon: tel:+2370000) that appears both
 *    URL-encoded in the path and plain in the body.
 *  - An expired token answers 401 with code 42, which is a refresh-and-retry,
 *    not a failure.
 *  - Throughput is capped at 5 messages/second.
 */
const TOKEN_URL = 'https://api.orange.com/oauth/v3/token';
const REQUEST_TIMEOUT_MS = 15_000;

/** Orange caps throughput at 5 TPS; leave headroom. */
const MIN_GAP_MS = 250;

/** Refresh this long before the hour is up, so a send never races expiry. */
const TOKEN_SAFETY_MS = 60_000;

interface OrangeTokenResponse {
  access_token?: string;
  expires_in?: string | number;
}

interface OrangeSendResponse {
  outboundSMSMessageRequest?: { resourceURL?: string };
}

export class OrangeSmsProvider implements SmsProvider {
  readonly name = 'orange';

  private token: { value: string; expiresAt: number } | null = null;
  /** One in-flight token request, so a burst does not mint several. */
  private tokenRequest: Promise<string> | null = null;
  /** Serialises sends to respect the documented 5 TPS ceiling. */
  private queue: Promise<unknown> = Promise.resolve();
  private lastSentAt = 0;

  isConfigured(): boolean {
    // The sender address counts as credentials here. It is the short code
    // Orange authorised for THIS account - there is no universal Cameroon
    // value - and a guessed one is rejected with a 400, or worse accepted and
    // never delivered. Treating a missing one as "not configured" sends the
    // message by the other rail instead of losing it.
    const { clientId, clientSecret, senderAddress } = config.orangeSms;
    return Boolean(clientId && clientSecret && senderAddress);
  }

  /** A valid bearer token, reused until it is nearly expired. */
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - TOKEN_SAFETY_MS > Date.now()) {
      return this.token.value;
    }
    if (this.tokenRequest) return this.tokenRequest;

    const { clientId, clientSecret } = config.orangeSms;
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    this.tokenRequest = (async () => {
      const response = await this.fetchWithTimeout(TOKEN_URL, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: 'grant_type=client_credentials',
      });
      const payload = (await response.json().catch(() => ({}))) as OrangeTokenResponse & {
        message?: string;
      };
      if (!response.ok || !payload.access_token) {
        throw new Error(
          `Orange token request failed (${response.status}): ${payload.message ?? 'no access_token'}`,
        );
      }
      const lifetimeMs = (Number(payload.expires_in) || 3600) * 1000;
      this.token = { value: payload.access_token, expiresAt: Date.now() + lifetimeMs };
      return this.token.value;
    })().finally(() => {
      this.tokenRequest = null;
    });
    return this.tokenRequest;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: abort.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Queue a send so no two leave closer together than the TPS ceiling allows. */
  private schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.lastSentAt + MIN_GAP_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.lastSentAt = Date.now();
      return task();
    });
    // Keep the chain alive even when one send rejects.
    this.queue = run.catch(() => undefined);
    return run;
  }

  async send(to: string, body: string): Promise<SmsSendResult> {
    return this.schedule(() => this.deliver(to, body, true));
  }

  private async deliver(to: string, body: string, mayRetry: boolean): Promise<SmsSendResult> {
    const { senderAddress, senderName, onNetOnly, receiptUrl } = config.orangeSms;
    const token = await this.accessToken();
    // The sender address appears twice: URL-encoded in the path, plain in the
    // body. Getting either wrong is a 400 from Orange.
    const url =
      `https://api.orange.com/smsmessaging/v1/outbound/${encodeURIComponent(senderAddress)}/requests` +
      (onNetOnly ? '?resource_type_parameter_management=SMS_OCB2' : '');

    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        outboundSMSMessageRequest: {
          address: `tel:${to.startsWith('+') ? to : `+${to}`}`,
          senderAddress,
          ...(senderName ? { senderName } : {}),
          // Ask Orange to report what actually happened. A 201 only means
          // ACCEPTED and there is no endpoint to ask later (the per-message
          // URLs answer 405), so without a receipt a message that is billed and
          // then dropped is indistinguishable from one that arrived.
          //
          // Note this is NOT the documented route: Orange's guide says the
          // receipt URL has to be registered through their web form and
          // whitelisted on their platform, after which they hand back an IP to
          // allow. This field is the generic ParlayX one, which Orange accepts
          // and echoes back; whether it honours it is unproven. Harmless if
          // ignored, and it costs nothing to ask.
          //
          // `callbackData` is deliberately NOT set. Orange puts the resource id
          // of the original send there, which is the only thing tying a receipt
          // back to its message - supplying our own would throw that away.
          ...(receiptUrl ? { receiptRequest: { notifyURL: receiptUrl } } : {}),
          outboundSMSTextMessage: { message: body },
        },
      }),
    });

    if (response.status === 401 && mayRetry) {
      // "Expired credentials" (code 42): mint a fresh token and try once more.
      this.token = null;
      return this.deliver(to, body, false);
    }

    const payload = (await response.json().catch(() => ({}))) as OrangeSendResponse & {
      message?: string;
      description?: string;
      requestError?: { serviceException?: { text?: string }; policyException?: { text?: string } };
    };
    if (!response.ok) {
      const detail =
        payload.requestError?.serviceException?.text ??
        payload.requestError?.policyException?.text ??
        payload.description ??
        payload.message ??
        'unknown error';
      // A 400 here is nearly always one of two configuration mistakes, and the
      // provider's own text ("Invalid sender address") does not say which knob
      // to turn. Naming the values in play turns a confusing rejection into an
      // obvious one.
      const hint =
        response.status === 400
          ? ` - check ORANGE_SMS_SENDER_ADDRESS (currently "${senderAddress}") is the short code` +
            ` authorised on this account, and that ORANGE_SMS_SENDER_NAME` +
            `${senderName ? ` ("${senderName}")` : ' (empty)'} is one Orange has whitelisted`
          : '';
      throw new Error(`Orange SMS failed (${response.status}): ${detail}${hint}`);
    }

    // The resource URL ends with the message id, which a delivery receipt
    // refers back to.
    const resourceUrl = payload.outboundSMSMessageRequest?.resourceURL ?? '';
    return { id: resourceUrl.split('/').pop() || undefined, provider: this.name };
  }

  /**
   * Remaining SMS units and when the bundle expires. Bundles run out and
   * expire, and when they do sending simply stops - so this is worth watching
   * rather than discovering through users who never got their code.
   */
  async balance(): Promise<
    {
      country: string;
      offerName: string;
      availableUnits: number;
      status: string;
      expirationDate: string | null;
    }[]
  > {
    const token = await this.accessToken();
    const response = await this.fetchWithTimeout('https://api.orange.com/sms/admin/v1/contracts', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Orange contracts request failed (${response.status})`);
    const contracts = (await response.json()) as {
      country?: string;
      offerName?: string;
      availableUnits?: number;
      status?: string;
      expirationDate?: string;
    }[];
    return (Array.isArray(contracts) ? contracts : []).map((contract) => ({
      country: contract.country ?? '-',
      // Worth reading back: it is what decides whether ORANGE_SMS_ONNET should
      // be set, and getting that wrong asks for an offer the account lacks.
      offerName: contract.offerName ?? '-',
      availableUnits: Number(contract.availableUnits ?? 0),
      status: contract.status ?? 'UNKNOWN',
      expirationDate: contract.expirationDate ?? null,
    }));
  }

  /** For logs: which number this provider is sending to, masked. */
  describeTarget(to: string): string {
    return maskNumber(to);
  }
}
