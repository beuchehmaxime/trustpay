import type { Twilio } from 'twilio';

import { config } from '../../config/env';
import { SmsProvider, SmsSendResult } from './types';

/**
 * Twilio SMS. Kept as the second rail: it reaches numbers outside Cameroon,
 * which the Orange bundle does not, and it is the fallback if an Orange bundle
 * runs out mid-flight.
 *
 * Note that a Twilio TRIAL account only delivers to numbers verified in its
 * console and rejects everything else with error 21608 - which is exactly how
 * every code this platform sent in September was silently lost.
 */
export class TwilioSmsProvider implements SmsProvider {
  readonly name = 'twilio';

  private client: Twilio | null = null;

  isConfigured(): boolean {
    return config.twilio.enabled;
  }

  private getClient(): Twilio {
    if (!this.client) {
      // Lazy require so the SDK only loads when Twilio is actually used.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const twilio = require('twilio') as typeof import('twilio');
      this.client = config.twilio.usingApiKey
        ? twilio(config.twilio.apiKeySid, config.twilio.apiKeySecret, {
            accountSid: config.twilio.accountSid,
          })
        : twilio(config.twilio.accountSid, config.twilio.authToken);
    }
    return this.client;
  }

  async send(to: string, body: string): Promise<SmsSendResult> {
    // Prefer the Messaging Service (sender selection + geo routing) when set,
    // otherwise a single From number.
    const sender = config.twilio.messagingServiceSid
      ? { messagingServiceSid: config.twilio.messagingServiceSid }
      : { from: config.twilio.from };
    const message = await this.getClient().messages.create({ to, body, ...sender });
    return { id: message.sid, provider: this.name };
  }
}
