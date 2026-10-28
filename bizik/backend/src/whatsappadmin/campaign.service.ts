import { WhatsAppCampaignStatus, WhatsAppRecipientStatus } from '@prisma/client';

import { recordAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { enqueueCampaignBatch } from '../lib/scheduler';
import { missingForProvider, outreachProvider } from './campaign-sender';
import { config } from '../config/env';
import { maskNumber } from '../lib/sms-providers/types';
import { WhatsAppClient } from '../whatsapp/whatsapp-client';
import { campaignSegments, findSegment, type SegmentMember } from './campaign-segments';

/**
 * Operator-sent WhatsApp outreach.
 *
 * This is the platform STARTING a conversation, which WhatsApp treats very
 * differently from the assistant answering one: outside a person's 24-hour
 * service window Meta only delivers a pre-APPROVED template, so a campaign is
 * always "template + variables", never free text. Trying to send free text here
 * would fail for almost every recipient and burn the number's quality rating.
 *
 * Three things this deliberately does NOT do:
 *  - it does not send to anyone who turned WhatsApp messages off. That choice is
 *    recorded as SKIPPED_OPTOUT rather than silently dropped, so the audience an
 *    operator approved still adds up in the report.
 *  - it does not run unthrottled. Meta rate-limits per number and a burst gets
 *    throttled or flagged, so sends are spaced.
 *  - it does not resolve the audience when the campaign is composed. The list is
 *    taken at SEND time and then frozen into recipient rows, so the report shows
 *    who was actually messaged rather than who matches the segment today.
 */

/**
 * The one failure a retry must never touch.
 *
 * Written by the rail into `recipient.error` when the number has no WhatsApp
 * account. That answer does not change on a second attempt, so retrying it only
 * spends the rate limit - the scarce resource here - on a number that cannot
 * receive anything. Matched as a substring because the stored error is
 * "<failure>: <provider message>".
 */
const NOT_ON_WHATSAPP = 'not_on_whatsapp';

/** Hard ceiling on one campaign. Past this an operator should be asking whether
 *  they really mean to message everyone, and a template send is not free. */
const MAX_AUDIENCE = 5000;

export interface CreateCampaignInput {
  name: string;
  segment: string;
  template: string;
  /** The message text, for rails that send prose instead of a template. */
  body?: string;
  language?: string;
  variables?: string[];
  note?: string;
}

function summarise(campaign: {
  id: string;
  name: string;
  segment: string;
  template: string;
  language: string;
  variables: unknown;
  note: string | null;
  status: WhatsAppCampaignStatus;
  audienceSize: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  createdById: string;
}) {
  const definition = findSegment(campaign.segment);
  return {
    id: campaign.id,
    name: campaign.name,
    segment: campaign.segment,
    segmentLabel: definition?.label ?? campaign.segment,
    template: campaign.template,
    language: campaign.language,
    variables: Array.isArray(campaign.variables) ? (campaign.variables as string[]) : [],
    note: campaign.note,
    status: campaign.status,
    audienceSize: campaign.audienceSize,
    sentCount: campaign.sentCount,
    failedCount: campaign.failedCount,
    skippedCount: campaign.skippedCount,
    startedAt: campaign.startedAt,
    finishedAt: campaign.finishedAt,
    createdAt: campaign.createdAt,
    createdById: campaign.createdById,
  };
}

export const CampaignService = {
  /**
   * The segment catalogue with a live count for each. Counts are what an
   * operator picks on, so they are computed now rather than cached.
   */
  async segments() {
    const definitions = campaignSegments();
    const counts = await Promise.all(definitions.map((definition) => definition.count()));
    return definitions.map((definition, index) => ({
      key: definition.key,
      label: definition.label,
      description: definition.description,
      count: counts[index],
    }));
  },

  /**
   * Which rail is live, and what it therefore needs from the composer.
   *
   * The composer cannot ask for the right thing without this: Meta wants a
   * template name it has approved, WasenderAPI wants the message itself. Asking
   * for both would mean every campaign carries one field that does nothing.
   */
  outreachRail() {
    const provider = outreachProvider();
    return {
      provider,
      /** Free text rather than a pre-approved template. */
      freeText: provider === 'wasender',
      perMinute: config.whatsapp.outreachPerMinute,
      dailyCap: config.whatsapp.outreachDailyCap,
    };
  },

  /**
   * Who a segment would reach, with a sample. Shown before sending because the
   * only way to be confident about a segment is to see a few of the people in
   * it - a mistaken segment key otherwise only reveals itself after delivery.
   */
  async preview(segmentKey: string) {
    const definition = findSegment(segmentKey);
    if (!definition) throw new AppError(400, 'Q-400', 'Unknown segment.');

    const members = await definition.members(MAX_AUDIENCE);
    const optedOut = await optOutPhones(members);

    return {
      segment: definition.key,
      label: definition.label,
      description: definition.description,
      total: members.length,
      /** How many of those have WhatsApp messages switched off. */
      optedOut: optedOut.size,
      reachable: members.length - optedOut.size,
      capped: members.length >= MAX_AUDIENCE,
      /** A handful of real rows, masked - enough to sanity-check the segment. */
      sample: members.slice(0, 8).map((member) => ({
        name: member.fullName,
        phone: maskNumber(member.phone),
        optedOut: optedOut.has(member.phone),
      })),
    };
  },

  async list(limit = 30) {
    const campaigns = await prisma.whatsAppCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
    const operatorNames = await namesFor(campaigns.map((campaign) => campaign.createdById));
    return campaigns.map((campaign) => ({
      ...summarise(campaign),
      createdBy: operatorNames.get(campaign.createdById) ?? null,
    }));
  },

  async detail(campaignId: string) {
    const campaign = await prisma.whatsAppCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new AppError(404, 'Q-404', 'Campaign not found.');

    const recipients = await prisma.whatsAppCampaignRecipient.findMany({
      where: { campaignId },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      take: 500,
    });
    const operatorNames = await namesFor([campaign.createdById]);

    // What a retry would actually pick up, counted rather than guessed. Two
    // groups, and both matter: recipients that failed for a reason worth
    // another go, and recipients a stopped campaign never reached at all. The
    // console needs the real number because "Retry 58 failed" on a campaign
    // whose 58 failures are all numbers that have no WhatsApp account is a
    // button that can only disappoint.
    const [queuedCount, retryableFailed] = await Promise.all([
      prisma.whatsAppCampaignRecipient.count({
        where: { campaignId, status: WhatsAppRecipientStatus.QUEUED },
      }),
      prisma.whatsAppCampaignRecipient.count({
        where: {
          campaignId,
          status: WhatsAppRecipientStatus.FAILED,
          NOT: { error: { contains: NOT_ON_WHATSAPP } },
        },
      }),
    ]);

    return {
      ...summarise(campaign),
      createdBy: operatorNames.get(campaign.createdById) ?? null,
      queuedCount,
      retryableFailed,
      retryable: queuedCount + retryableFailed,
      recipients: recipients.map((recipient) => ({
        id: recipient.id,
        // Numbers are masked in the console: an operator needs to see that a
        // send failed, not to be handed a list of contact details.
        phone: maskNumber(recipient.phone),
        status: recipient.status,
        error: recipient.error,
        sentAt: recipient.sentAt,
      })),
    };
  },

  /**
   * Create a campaign and start sending it.
   *
   * The audience is resolved and written as recipient rows FIRST, in one go, and
   * only then delivered. If the process dies halfway, the rows say exactly who
   * was already messaged and who was still QUEUED - which a "send as we go"
   * loop could not tell anyone afterwards.
   */
  async send(operatorId: string, input: CreateCampaignInput, requestContext: { ip?: string; userAgent?: string }) {
    if (!config.whatsapp.enabled) {
      throw new AppError(409, 'Q-409', 'The WhatsApp channel is switched off. Turn it on before sending a campaign.');
    }
    const definition = findSegment(input.segment);
    if (!definition) throw new AppError(400, 'Q-400', 'Unknown segment.');

    // Checked here, not per recipient. Discovering a missing body on recipient
    // 300 means 299 people got nothing and the operator finds out from a
    // failure count instead of an error.
    const missing = missingForProvider({ template: input.template, body: input.body });
    if (missing) throw new AppError(400, 'Q-400', missing);

    const members = await definition.members(MAX_AUDIENCE);
    if (!members.length) {
      throw new AppError(409, 'Q-409', 'Nobody is in that segment right now, so there is nothing to send.');
    }
    const optedOut = await optOutPhones(members);

    const campaign = await prisma.whatsAppCampaign.create({
      data: {
        name: input.name.trim(),
        segment: definition.key,
        template: input.template.trim(),
        language: input.language?.trim() || 'en',
        variables: input.variables ?? [],
        body: input.body?.trim() || null,
        note: input.note?.trim() || null,
        createdById: operatorId,
        status: WhatsAppCampaignStatus.SENDING,
        audienceSize: members.length,
        skippedCount: optedOut.size,
        startedAt: new Date(),
      },
    });

    // One insert for the whole audience: the record of who was in it must exist
    // before the first message goes out.
    await prisma.whatsAppCampaignRecipient.createMany({
      data: members.map((member) => ({
        campaignId: campaign.id,
        userId: member.id,
        phone: member.phone,
        status: optedOut.has(member.phone)
          ? WhatsAppRecipientStatus.SKIPPED_OPTOUT
          : WhatsAppRecipientStatus.QUEUED,
      })),
      skipDuplicates: true,
    });

    void recordAudit({
      actorId: operatorId,
      action: 'whatsapp.campaign.send',
      entityType: 'WhatsAppCampaign',
      entityId: campaign.id,
      result: 'SUCCESS',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      after: {
        name: campaign.name,
        segment: campaign.segment,
        template: campaign.template,
        audienceSize: members.length,
        skipped: optedOut.size,
      },
    });

    // Queued, not looped. Delivery used to run in this process, which meant a
    // deploy mid-campaign left it half-sent and the pace was a sleeping timer
    // in a request handler. The queue survives restarts and spaces the batches
    // out, which is what keeps a QR-linked WhatsApp account from being banned
    // for bulk traffic.
    await enqueueCampaignBatch(campaign.id);

    return summarise(campaign);
  },

  /**
   * Stop a campaign that is still going. Already-delivered messages cannot be
   * recalled, so this only prevents the remaining QUEUED ones from being sent.
   */
  async cancel(operatorId: string, campaignId: string, requestContext: { ip?: string; userAgent?: string }) {
    const campaign = await prisma.whatsAppCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new AppError(404, 'Q-404', 'Campaign not found.');
    if (campaign.status !== WhatsAppCampaignStatus.SENDING) {
      throw new AppError(409, 'Q-409', 'That campaign is not sending, so there is nothing to stop.');
    }

    await prisma.whatsAppCampaign.update({
      where: { id: campaignId },
      data: { status: WhatsAppCampaignStatus.CANCELLED, finishedAt: new Date() },
    });

    void recordAudit({
      actorId: operatorId,
      action: 'whatsapp.campaign.cancel',
      entityType: 'WhatsAppCampaign',
      entityId: campaignId,
      result: 'SUCCESS',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      after: { sentBeforeStop: campaign.sentCount },
    });

    return this.detail(campaignId);
  },

  /**
   * Try the ones that did not go, again.
   *
   * Requeues the FAILED recipients of a finished or stopped campaign and
   * restarts it. Two things it deliberately does not do:
   *
   * Nobody already SENT is touched. They are not QUEUED, the delivery loop only
   * ever reads QUEUED, and the unique index on (campaignId, phone) means they
   * cannot be re-added - so a retry cannot message the same person twice, which
   * is the failure that would actually cost us the number.
   *
   * Recipients that failed because they are NOT ON WHATSAPP stay failed. That
   * answer will not change on a second attempt, and retrying it just spends the
   * rate limit on a number that cannot receive anything.
   */
  async retryFailed(operatorId: string, campaignId: string, requestContext: { ip?: string; userAgent?: string }) {
    const campaign = await prisma.whatsAppCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new AppError(404, 'Q-404', 'Campaign not found.');
    if (campaign.status === WhatsAppCampaignStatus.SENDING) {
      throw new AppError(409, 'Q-409', 'That campaign is still sending. Stop it first, or wait.');
    }

    const requeued = await prisma.whatsAppCampaignRecipient.updateMany({
      where: {
        campaignId,
        status: WhatsAppRecipientStatus.FAILED,
        // Permanently unreachable numbers are left alone.
        NOT: { error: { contains: NOT_ON_WHATSAPP } },
      },
      data: { status: WhatsAppRecipientStatus.QUEUED, attempts: 0, error: null },
    });

    // A campaign that was STOPPED mid-run leaves its remainder sitting QUEUED -
    // cancel does not touch recipient rows, it just stops reading them. So a
    // retry has work to do even when nothing failed, and refusing it here
    // would strand everyone the operator stopped short of.
    const stillQueued = await prisma.whatsAppCampaignRecipient.count({
      where: { campaignId, status: WhatsAppRecipientStatus.QUEUED },
    });

    if (stillQueued === 0) {
      throw new AppError(
        409,
        'Q-409',
        'Nothing to retry - everyone was either reached, or is not on WhatsApp.',
      );
    }

    // failedCount is decremented by what went back in the queue, so the totals
    // keep matching the rows rather than counting the same person twice once
    // they are tried again.
    await prisma.whatsAppCampaign.update({
      where: { id: campaignId },
      data: {
        status: WhatsAppCampaignStatus.SENDING,
        failedCount: { decrement: requeued.count },
        finishedAt: null,
      },
    });

    void recordAudit({
      actorId: operatorId,
      action: 'whatsapp.campaign.retry',
      entityType: 'WhatsAppCampaign',
      entityId: campaignId,
      result: 'SUCCESS',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      after: { requeued: requeued.count, name: campaign.name },
    });

    console.log(
      `[campaign] ${campaign.name}: ${stillQueued} recipient(s) back in the queue `
        + `(${requeued.count} retried after failing)`,
    );
    await enqueueCampaignBatch(campaignId);
    return this.detail(campaignId);
  },

  /**
   * Pick up campaigns that were still SENDING when the process last stopped.
   *
   * Delivery runs in this process, so a deploy or a crash mid-campaign leaves
   * the remaining recipients QUEUED and the campaign showing "sending" for ever.
   * Because every send is recorded per recipient before the next one starts, the
   * loop can simply be restarted: it only ever picks up QUEUED rows, so nobody
   * is messaged twice.
   */
  async resumeInterrupted(): Promise<void> {
    const interrupted = await prisma.whatsAppCampaign.findMany({
      where: { status: WhatsAppCampaignStatus.SENDING },
      select: { id: true, name: true },
    });
    for (const campaign of interrupted) {
      console.log(`[campaign] resuming ${campaign.name} (${campaign.id}) after a restart`);
      await enqueueCampaignBatch(campaign.id);
    }
  },
};

/** Which of these people have switched WhatsApp messages off. */
async function optOutPhones(members: SegmentMember[]): Promise<Set<string>> {
  if (!members.length) return new Set();
  const channels = await prisma.whatsAppChannel.findMany({
    where: { userId: { in: members.map((member) => member.id) }, optIn: false },
    select: { phone: true },
  });
  return new Set(channels.map((channel) => channel.phone));
}

async function namesFor(userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)];
  if (!unique.length) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, fullName: true, email: true },
  });
  return new Map(users.map((user) => [user.id, user.fullName || user.email || user.id]));
}

