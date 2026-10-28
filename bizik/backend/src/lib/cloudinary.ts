import { v2 as cloudinary } from 'cloudinary';

import { config } from '../config/env';

/**
 * Cloudinary image storage (deliverables, dispute evidence). Configured from
 * env; when credentials are absent the app falls back to local storage
 * (lib/storage.ts) so dev/CI keep working without a Cloudinary account.
 */
export const cloudinaryEnabled = Boolean(
  config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret,
);

if (cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true,
  });
}

export interface UploadedAsset {
  url: string;
  publicId: string;
  bytes: number;
  format: string;
}

/**
 * Upload a base64 / data-URL image to Cloudinary under `bizik/<purpose>`.
 * Accepts a raw base64 string or a full `data:` URL.
 */
export async function uploadToCloudinary(
  input: string,
  opts: { purpose: string; mimeType?: string },
): Promise<UploadedAsset> {
  const dataUri = input.startsWith('data:')
    ? input
    : `data:${opts.mimeType || 'image/jpeg'};base64,${input}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder: `bizik/${opts.purpose}`,
    resource_type: 'image',
  });
  return {
    url: result.secure_url,
    publicId: result.public_id,
    bytes: result.bytes,
    format: result.format,
  };
}
