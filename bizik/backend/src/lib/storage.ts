import crypto from 'crypto';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';

import { config } from '../config/env';
import { AppError } from './errors';

/**
 * Local object storage for uploaded documents (KYC IDs, selfies, deliverables).
 * In production this is replaced by an encrypted S3 bucket (SRS NFR-SEC-002);
 * the {bucket, objectKey} shape mirrors S3 so the swap is a single adapter.
 */
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export interface StoredObject {
  bucket: string;
  objectKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Decode a base64 (or data-URL) payload and persist it under `purpose/owner/`.
 * Validates MIME type and size; throws an AppError the controller surfaces.
 */
export async function saveBase64(
  input: string,
  opts: { ownerId: string; purpose: string; mimeType?: string },
): Promise<StoredObject> {
  let mime = opts.mimeType || 'image/jpeg';
  let b64 = input;

  const dataUrl = /^data:([^;]+);base64,(.*)$/s.exec(input);
  if (dataUrl) {
    mime = dataUrl[1];
    b64 = dataUrl[2];
  }

  const ext = MIME_EXT[mime];
  if (!ext) {
    throw new AppError(422, 'Q-422', `Unsupported document type: ${mime}`);
  }

  const buffer = Buffer.from(b64, 'base64');
  if (buffer.length === 0) {
    throw new AppError(422, 'Q-422', 'Document is empty or not valid base64.');
  }
  if (buffer.length > config.uploads.maxBytes) {
    throw new AppError(
      413,
      'Q-413',
      `Document exceeds the ${Math.round(config.uploads.maxBytes / 1024 / 1024)}MB limit.`,
    );
  }

  const objectKey = `${opts.purpose}/${opts.ownerId}/${crypto.randomUUID()}.${ext}`;
  const abs = path.join(config.uploads.dir, objectKey);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buffer);

  return {
    bucket: 'local',
    objectKey,
    fileName: path.basename(objectKey),
    mimeType: mime,
    sizeBytes: buffer.length,
  };
}

/** Absolute path for a stored object key (for streaming back to a client). */
export function resolveObjectPath(objectKey: string): string {
  return path.join(config.uploads.dir, objectKey);
}

/** Open a read stream for a stored object. */
export function readObjectStream(objectKey: string) {
  return createReadStream(resolveObjectPath(objectKey));
}
