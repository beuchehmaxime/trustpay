import crypto from 'crypto';

import { config } from '../config/env';

/**
 * Field-level encryption for sensitive KYC data at rest (SRS NFR-SEC-002).
 *
 * Uses AES-256-GCM with a per-value random IV. The 256-bit key is derived from
 * `config.kyc.encKey` via SHA-256 so any passphrase length works. Ciphertext is
 * stored as `v1.<iv>.<authTag>.<data>` (all base64) so the format is versioned
 * and self-describing - older/plaintext values decrypt transparently.
 */
const KEY = crypto.createHash('sha256').update(config.kyc.encKey).digest();
const PREFIX = 'v1';

export function encryptField(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString('base64'),
    tag.toString('base64'),
    enc.toString('base64'),
  ].join('.');
}

export function decryptField(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== PREFIX) return payload; // legacy/plaintext
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    KEY,
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

/** Show only the last 4 characters of an ID number (e.g. "•••• 4567"). */
export function maskIdNumber(plain: string): string {
  const trimmed = plain.trim();
  if (trimmed.length <= 4) return trimmed;
  return `•••• ${trimmed.slice(-4)}`;
}
