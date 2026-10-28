import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What a retry is allowed to touch.
 *
 * Retrying is the one operation here that reads rows somebody has already been
 * messaged through, so the where-clause IS the safety property. Three ways it
 * could go wrong, each with a different cost:
 *
 *  - picking up SENT rows messages real people a second time, from an account
 *    that also carries verification codes. That is how the number gets banned.
 *  - picking up `not_on_whatsapp` failures spends the rate limit - the scarce
 *    thing - on numbers that cannot receive anything.
 *  - refusing a STOPPED campaign strands everyone the operator stopped short
 *    of, because cancel leaves the remainder QUEUED rather than failing it.
 *
 * These assert on the query the service actually builds, because that is where
 * the first live run lost 52 recipients.
 */

const updateMany = vi.fn();
const countRecipients = vi.fn();
const findUnique = vi.fn();
const updateCampaign = vi.fn();
const findMany = vi.fn();
const enqueueCampaignBatch = vi.fn();

vi.mock('../lib/prisma', () => ({
  prisma: {
    // retryFailed returns the refreshed detail, which resolves the operator's
    // name - stubbed so these tests stay about the retry rules.
    user: { findMany: async () => [] },
    whatsAppCampaign: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => updateCampaign(...args),
    },
    whatsAppCampaignRecipient: {
      updateMany: (...args: unknown[]) => updateMany(...args),
      count: (...args: unknown[]) => countRecipients(...args),
      findMany: (...args: unknown[]) => findMany(...args),
    },
  },
}));
vi.mock('../lib/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('../lib/scheduler', () => ({
  enqueueCampaignBatch: (...args: unknown[]) => enqueueCampaignBatch(...args),
}));

// A static import, not `await import(...)`: vitest hoists vi.mock above the
// imports anyway, and top-level await does not compile under the CommonJS
// target the production build uses.
import { CampaignService } from './campaign.service';

const campaignRow = {
  id: 'camp-1',
  name: 'September nudge',
  segment: 'unverified',
  template: '',
  language: 'en',
  variables: [],
  body: 'Hello {name}',
  note: null,
  status: 'CANCELLED',
  audienceSize: 90,
  sentCount: 21,
  failedCount: 58,
  skippedCount: 0,
  startedAt: new Date(),
  finishedAt: new Date(),
  createdAt: new Date(),
  createdById: 'operator-1',
};

describe('retrying a campaign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue({ ...campaignRow });
    findMany.mockResolvedValue([]);
    updateCampaign.mockResolvedValue({ ...campaignRow });
    updateMany.mockResolvedValue({ count: 52 });
    countRecipients.mockResolvedValue(52);
  });

  it('only ever requeues FAILED rows, so nobody already SENT is messaged twice', async () => {
    await CampaignService.retryFailed('operator-1', 'camp-1', {});

    const where = updateMany.mock.calls[0][0].where;
    expect(where.status).toBe('FAILED');
    expect(where.campaignId).toBe('camp-1');
    // Not "status: { not: SENT }" or any other shape that could widen later.
    expect(JSON.stringify(where)).not.toContain('SENT');
  });

  it('leaves numbers that are not on WhatsApp failed', async () => {
    await CampaignService.retryFailed('operator-1', 'camp-1', {});

    const where = updateMany.mock.calls[0][0].where;
    expect(where.NOT).toEqual({ error: { contains: 'not_on_whatsapp' } });
  });

  it('clears the attempt counter so a requeued recipient gets a full set of tries', async () => {
    await CampaignService.retryFailed('operator-1', 'camp-1', {});

    expect(updateMany.mock.calls[0][0].data).toMatchObject({
      status: 'QUEUED',
      attempts: 0,
      error: null,
    });
  });

  it('resumes a STOPPED campaign whose remainder never failed, it only never ran', async () => {
    // Cancel does not touch recipient rows - it stops reading them. So these
    // eleven are QUEUED, not FAILED, and refusing the retry would strand them.
    updateMany.mockResolvedValue({ count: 0 });
    countRecipients.mockResolvedValue(11);

    await expect(CampaignService.retryFailed('operator-1', 'camp-1', {})).resolves.toBeDefined();
    expect(enqueueCampaignBatch).toHaveBeenCalledWith('camp-1');
  });

  it('refuses when there is nothing queued afterwards, rather than restarting a finished campaign', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    countRecipients.mockResolvedValue(0);

    await expect(CampaignService.retryFailed('operator-1', 'camp-1', {})).rejects.toThrow(
      /nothing to retry/i,
    );
    expect(enqueueCampaignBatch).not.toHaveBeenCalled();
  });

  it('refuses while the campaign is still SENDING, so two loops cannot run at once', async () => {
    findUnique.mockResolvedValue({ ...campaignRow, status: 'SENDING' });

    await expect(CampaignService.retryFailed('operator-1', 'camp-1', {})).rejects.toThrow(
      /still sending/i,
    );
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('decrements the failure count by what went back, so the totals keep matching the rows', async () => {
    await CampaignService.retryFailed('operator-1', 'camp-1', {});

    expect(updateCampaign.mock.calls[0][0].data).toMatchObject({
      status: 'SENDING',
      failedCount: { decrement: 52 },
      finishedAt: null,
    });
  });

  it('404s on a campaign that does not exist instead of enqueueing an empty run', async () => {
    findUnique.mockResolvedValue(null);

    await expect(CampaignService.retryFailed('operator-1', 'nope', {})).rejects.toThrow(/not found/i);
    expect(enqueueCampaignBatch).not.toHaveBeenCalled();
  });
});
