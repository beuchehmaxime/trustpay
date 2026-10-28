import { recordAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import { roleCan } from '../lib/permissions';
import { prisma } from '../lib/prisma';
import { cloudinaryEnabled, uploadToCloudinary } from '../lib/cloudinary';
import { sanitizeImage } from '../lib/image-sanitizer';
import { saveBase64 } from '../lib/storage';
import { FileRepository } from './file.repository';

/**
 * Which permission lets an operator open someone else's file, by what the file
 * is for. This used to be a role-string check against 'admin'/'compliance'/
 * 'mediator', and since every operator is created with role 'ADMIN', any
 * operator - a help-desk agent, a blog editor - could walk file ids and pull
 * national ID photos and liveness selfies. Access now follows the operator's
 * actual permission for that kind of document, and every such read is audited.
 */
const PERMISSION_BY_PURPOSE: Record<string, string> = {
  kyc: 'kyc.view',
  dispute: 'disputes.view',
  deliverable: 'disputes.view',
  message: 'support.view',
};

/** Fallback for a file with no purpose recorded: treat it as sensitive. */
const DEFAULT_FILE_PERMISSION = 'kyc.view';

/**
 * Purposes whose images hold sensitive personal data (identity documents,
 * selfies). These are kept in PRIVATE local storage and served only through the
 * authenticated file proxy - never uploaded to public Cloudinary URLs.
 */
const PRIVATE_PURPOSES = new Set(['kyc']);

export const FileService = {
  /**
   * Persist a base64/data-URL image and record its metadata. Images go to
   * Cloudinary when configured (returning a hosted URL); otherwise they fall
   * back to local storage. The antivirus scan (SRS FR-FILE-002) is simulated as
   * CLEAN here; in production the file lands as PENDING and a scanner worker
   * flips it to CLEAN/INFECTED.
   */
  async storeImage(
    ownerId: string,
    base64: string,
    purpose: string,
    _mimeType?: string,
  ) {
    // Steganography guard: decode + re-encode the image to a clean JPEG before
    // it is ever stored, destroying any hidden metadata, appended bytes or
    // LSB-embedded payload. The result is what we persist (never the raw upload).
    const clean = await sanitizeImage(base64);
    const keepPrivate = PRIVATE_PURPOSES.has(purpose);

    // Sensitive documents (KYC) always stay in private local storage; other
    // images go to Cloudinary when configured for a hosted CDN URL.
    if (cloudinaryEnabled && !keepPrivate) {
      const asset = await uploadToCloudinary(clean.dataUri, { purpose, mimeType: clean.mimeType });
      return FileRepository.create({
        ownerId,
        bucket: 'cloudinary',
        objectKey: asset.publicId,
        url: asset.url,
        fileName: asset.publicId.split('/').pop() ?? asset.publicId,
        mimeType: clean.mimeType,
        sizeBytes: asset.bytes,
        purpose,
        scanStatus: 'CLEAN',
      });
    }
    const obj = await saveBase64(clean.dataUri, { ownerId, purpose, mimeType: clean.mimeType });
    return FileRepository.create({
      ownerId,
      bucket: obj.bucket,
      objectKey: obj.objectKey,
      fileName: obj.fileName,
      mimeType: obj.mimeType,
      sizeBytes: obj.sizeBytes,
      purpose,
      scanStatus: 'CLEAN',
    });
  },

  /**
   * Store several images and return their file ids. Best-effort per image -
   * skips any that fail so one bad upload doesn't sink the whole submission.
   */
  async storeImages(ownerId: string, images: string[], purpose: string): Promise<string[]> {
    const ids: string[] = [];
    for (const image of images) {
      try {
        const file = await this.storeImage(ownerId, image, purpose);
        ids.push(file.id);
      } catch (error) {
        console.warn('[file] image upload failed:', (error as Error).message);
      }
    }
    return ids;
  },

  /** Resolve file ids to displayable image URLs (Cloudinary URL or a proxy path). */
  async urlsForIds(fileIds: string[]): Promise<{ id: string; url: string }[]> {
    if (fileIds.length === 0) return [];
    const files = await FileRepository.findManyByIds(fileIds);
    return files.map((file) => ({
      id: file.id,
      url: file.url ?? `/api/v1/file/${file.id}`,
    }));
  },

  /** Fetch a file's metadata: the owner, or an operator with the right permission. */
  async getForViewer(fileId: string, viewer: { id: string; role: string }) {
    const file = await FileRepository.findById(fileId);
    if (!file) throw new AppError(404, 'Q-404', 'File not found');
    if (file.ownerId === viewer.id) return file;

    const needed = PERMISSION_BY_PURPOSE[file.purpose ?? ''] ?? DEFAULT_FILE_PERMISSION;
    const operator = await prisma.user.findUnique({
      where: { id: viewer.id },
      include: { adminRole: true },
    });
    if (!roleCan(operator?.adminRole, needed)) {
      throw new AppError(403, 'Q-403', 'You do not have access to this file.');
    }
    // Someone else's identity document was opened: that belongs in the log.
    void recordAudit({
      actorId: viewer.id,
      action: 'file.view',
      entityType: 'File',
      entityId: file.id,
      result: 'SUCCESS',
      after: { purpose: file.purpose ?? null, ownerId: file.ownerId },
    });
    return file;
  },
};
