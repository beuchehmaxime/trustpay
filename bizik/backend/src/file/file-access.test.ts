import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Who may open a stored file.
 *
 * This is an access-control rule over photographs of people's goods and their
 * identity documents, so the tests are written from both directions: the
 * person who must be let in, and the person who must not.
 *
 * The bug that prompted them: a buyer could see the photograph they filed and
 * not the one the seller filed against them. They were arguing against
 * evidence they could not look at, in a case a mediator would decide using it.
 */

const doubles = vi.hoisted(() => ({
  file: null as Record<string, unknown> | null,
  evidence: null as Record<string, unknown> | null,
  submission: null as Record<string, unknown> | null,
  contract: null as Record<string, unknown> | null,
  operatorRole: null as unknown,
}));

vi.mock('./file.repository', () => ({
  FileRepository: { findById: vi.fn(async () => doubles.file) },
}));

vi.mock('../lib/prisma', () => ({
  prisma: {
    disputeEvidence: { findFirst: vi.fn(async () => doubles.evidence) },
    milestoneSubmission: { findFirst: vi.fn(async () => doubles.submission) },
    contract: { findUnique: vi.fn(async () => doubles.contract) },
    user: { findUnique: vi.fn(async () => ({ adminRole: doubles.operatorRole })) },
  },
}));

vi.mock('../lib/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('../lib/cloudinary', () => ({ cloudinaryEnabled: () => false, uploadToCloudinary: vi.fn() }));
vi.mock('../lib/image-sanitizer', () => ({ sanitizeImage: vi.fn() }));
vi.mock('../lib/storage', () => ({ saveBase64: vi.fn() }));

import { FileService } from './file.service';

const BUYER = 'user-buyer';
const SELLER = 'user-seller';
const STRANGER = 'user-stranger';

/** A file the SELLER uploaded as dispute evidence on a deal with the buyer. */
function sellerDisputePhoto() {
  doubles.file = { id: 'file-1', ownerId: SELLER, purpose: 'dispute' };
  doubles.evidence = { dispute: { contractId: 'contract-1' } };
  doubles.submission = null;
  doubles.contract = { creatorId: BUYER, counterpartyId: SELLER };
}

beforeEach(() => {
  vi.clearAllMocks();
  doubles.file = null;
  doubles.evidence = null;
  doubles.submission = null;
  doubles.contract = null;
  doubles.operatorRole = null;
});

describe('dispute evidence', () => {
  it('lets the OTHER party on the deal see it', async () => {
    sellerDisputePhoto();

    const file = await FileService.getForViewer('file-1', { id: BUYER, role: 'CLIENT' });

    expect(file).toMatchObject({ id: 'file-1' });
  });

  it('still lets the person who uploaded it see it', async () => {
    sellerDisputePhoto();

    const file = await FileService.getForViewer('file-1', { id: SELLER, role: 'CLIENT' });

    expect(file).toMatchObject({ id: 'file-1' });
  });

  it('refuses someone who is not on the deal', async () => {
    sellerDisputePhoto();

    await expect(
      FileService.getForViewer('file-1', { id: STRANGER, role: 'CLIENT' }),
    ).rejects.toThrow(/do not have access/i);
  });
});

describe('delivery photos', () => {
  it('lets the buyer see what the seller submitted', async () => {
    doubles.file = { id: 'file-2', ownerId: SELLER, purpose: 'deliverable' };
    doubles.submission = { milestone: { contractId: 'contract-1' } };
    doubles.contract = { creatorId: BUYER, counterpartyId: SELLER };

    const file = await FileService.getForViewer('file-2', { id: BUYER, role: 'CLIENT' });

    expect(file).toMatchObject({ id: 'file-2' });
  });
});

describe('identity documents stay shut', () => {
  it('does NOT open a KYC document to a counterparty', async () => {
    // The whole point of checking the purpose first. A KYC file has no deal
    // behind it, so "is this viewer a party" must never be asked of it - and
    // even if some row did link one, this must refuse.
    doubles.file = { id: 'file-3', ownerId: SELLER, purpose: 'kyc' };
    doubles.evidence = { dispute: { contractId: 'contract-1' } };
    doubles.contract = { creatorId: BUYER, counterpartyId: SELLER };

    await expect(
      FileService.getForViewer('file-3', { id: BUYER, role: 'CLIENT' }),
    ).rejects.toThrow(/do not have access/i);
  });

  it('refuses a file whose deal cannot be traced', async () => {
    // An orphaned file falls through to the operator check rather than being
    // quietly opened up.
    doubles.file = { id: 'file-4', ownerId: SELLER, purpose: 'dispute' };
    doubles.evidence = null;
    doubles.submission = null;

    await expect(
      FileService.getForViewer('file-4', { id: BUYER, role: 'CLIENT' }),
    ).rejects.toThrow(/do not have access/i);
  });
});
