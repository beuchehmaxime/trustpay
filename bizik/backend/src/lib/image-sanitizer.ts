import Jimp from 'jimp';

import { AppError } from './errors';

/**
 * Image sanitiser - the platform's defence against steganography and malicious
 * uploads (KYC IDs, deliverables, dispute evidence).
 *
 * Steganography hides data in an image's metadata (EXIF), in the least-
 * significant bits of pixels, or in bytes appended after the image's logical
 * end. The only reliable defence is to fully **decode the pixels and re-encode**
 * a fresh image: that discards ALL non-pixel data - metadata, trailing bytes,
 * and LSB-embedded payloads are destroyed. We also verify the real file type by
 * its magic bytes (rejecting polyglot/disguised files) and cap the dimensions.
 */

const MAX_DIMENSION = 2400;

/** Verify the real image type from its magic bytes (not a trusted extension). */
function sniffType(buffer: Buffer): 'jpeg' | 'png' | 'bmp' | null {
  if (buffer.length < 8) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) return 'bmp';
  return null;
}

export interface SanitizedImage {
  dataUri: string;
  mimeType: string;
  bytes: number;
}

/**
 * Decode and re-encode an uploaded image to a clean JPEG, stripping every trace
 * of hidden data. Throws a 422 for anything that isn't a genuine JPEG/PNG/BMP.
 */
export async function sanitizeImage(input: string): Promise<SanitizedImage> {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(input);
  const base64 = match ? match[2] : input;
  const raw = Buffer.from(base64, 'base64');

  if (raw.length === 0) throw new AppError(422, 'Q-422', 'The image is empty or not valid.');
  if (!sniffType(raw)) {
    throw new AppError(422, 'Q-422', 'Only genuine JPEG, PNG or BMP images are accepted.');
  }

  let image: Jimp;
  try {
    image = await Jimp.read(raw);
  } catch {
    throw new AppError(422, 'Q-422', 'The image could not be read - it may be corrupt or disguised.');
  }

  // Re-encode fresh pixels only: destroys EXIF/metadata, appended bytes and any
  // LSB-embedded payload. Downscale oversized images and normalise to JPEG.
  if (image.getWidth() > MAX_DIMENSION || image.getHeight() > MAX_DIMENSION) {
    image.scaleToFit(MAX_DIMENSION, MAX_DIMENSION);
  }
  image.quality(85);
  const clean = await image.getBufferAsync(Jimp.MIME_JPEG);

  return {
    dataUri: `data:image/jpeg;base64,${clean.toString('base64')}`,
    mimeType: Jimp.MIME_JPEG,
    bytes: clean.length,
  };
}
