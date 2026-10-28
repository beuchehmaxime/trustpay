import { config } from '../config/env';
import { prisma } from './prisma';

/** Public links to the human-readable legal documents (marketing/PWA site). */
export const legalLinks = {
  terms: `${config.webUrl}/terms-of-service`,
  privacy: `${config.webUrl}/privacy-policy`,
};

/**
 * Persist a durable record that this user accepted the Terms of Service and
 * Privacy Policy. Captures the exact affirmative message, the channel, and the
 * live document versions + links, so consent can be proven later even after the
 * documents change. Best-effort: a consent-log failure must never block signup,
 * but it is logged loudly because the record matters legally.
 */
export async function recordConsent(input: {
  userId: string;
  channel: 'whatsapp' | 'web' | 'mobile';
  phone?: string | null;
  message: string;
}): Promise<void> {
  try {
    const docs = await prisma.legalDocument.findMany({
      where: { type: { in: ['TERMS', 'PRIVACY'] } },
      select: { type: true, version: true },
    });
    const versionOf = (type: 'TERMS' | 'PRIVACY') =>
      docs.find((doc) => doc.type === type)?.version ?? '1.0';

    await prisma.consentRecord.create({
      data: {
        userId: input.userId,
        channel: input.channel,
        phone: input.phone ?? null,
        message: input.message.slice(0, 500),
        documents: [
          { type: 'TERMS', version: versionOf('TERMS'), url: legalLinks.terms },
          { type: 'PRIVACY', version: versionOf('PRIVACY'), url: legalLinks.privacy },
        ],
      },
    });
  } catch (error) {
    console.error('[consent] failed to record consent', (error as Error).message);
  }
}
