import { WhatsAppCampaignStatus, WhatsAppRecipientStatus } from '@prisma/client';

import { config } from '../config/env';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { emitAdminEvent } from '../lib/admin-events';
import { sendCampaignMessage } from './campaign-sender';
import { personalise, usesName } from './personalise';

/**
 * Campaign delivery, one small batch at a time.
 *
 * It used to be a `void deliver(id)` loop running inside the request process,
 * spacing sends 120ms apart. Two problems with that, and the second is the
 * serious one:
 *
 * A loop in the web process does not survive a deploy. It was patched over by
 * re-scanning for SENDING campaigns at boot, which works, but means "is this
 * campaign running?" has no answer other than "probably".
 *
 * And 120ms is eight messages a second. From a QR-linked WhatsApp account doing
 * unprompted bulk outreach, that is the exact traffic shape abuse detection
 * looks for. The account is not a business API client and has none of that
 * protection - the realistic outcome of one campaign at that rate is a ban, and
 * the number that carries verification codes is the same number.
 *
 * So: a queued job that sends a few, then schedules itself again with a delay.
 * The pace is enforced by the queue rather than by a sleeping process, it
 * survives restarts, and a cancellation is noticed within one batch.
 */

export const CAMPAIGN_SEND_JOB = 'whatsapp-campaign-send';

/**
 * ONE message per job.
 *
 * It was three, with the delay applied between batches - so three messages went
 * out back to back and then the queue waited. WasenderAPI's account protection
 * refuses anything inside five seconds, which meant one of each three landed
 * and the other two were written off as failures. 52 of the first 58.
 *
 * The gap has to be between MESSAGES, and the only way to guarantee that while
 * surviving a restart is to make the message the unit of work.
 */
const BATCH_SIZE = 1;

/** Rolling-day counter, so the cap survives a restart. */
const DAILY_KEY = 'whatsapp:outreach:sent-today';

/**
 * How many times one recipient may be retried after a transient refusal.
 *
 * Generous, because the thing being retried is our own pacing rather than
 * anything wrong with the recipient - but finite, so a rail that refuses
 * everything stops instead of looping on the same person all day.
 */
const MAX_ATTEMPTS = 6;

function dayKey(): string {
  return `${DAILY_KEY}:${new Date().toISOString().slice(0, 10)}`;
}

/**
 * How long to wait before the next message, with jitter.
 *
 * The floor is the provider's own refusal window, not an arbitrary minimum.
 * Jitter is added ON TOP of it rather than around it: jittering downwards would
 * occasionally dip under the limit and fail that message outright, which is the
 * bug this function exists to prevent.
 */
export function batchDelayMs(): number {
  const perMinute = Math.max(1, config.whatsapp.outreachPerMinute);
  const floor = Math.max(1_000, config.whatsapp.outreachMinGapMs);
  const base = Math.max(floor, (60_000 / perMinute) * BATCH_SIZE);
  // Up to +40%, never below. A perfectly regular cadence is itself a signal
  // that the sender is a machine, which is the thing being avoided here.
  return Math.round(base + base * 0.4 * Math.random());
}

async function sentToday(): Promise<number> {
  try {
    const value = await redis.get(dayKey());
    return value ? Number(value) : 0;
  } catch {
    // Redis down: report 0 rather than blocking a campaign on a counter. The
    // per-batch pacing still holds, which is the protection that matters.
    return 0;
  }
}

async function countSend(): Promise<void> {
  try {
    const key = dayKey();
    const total = await redis.incr(key);
    // Expire a little over a day, so yesterday's key cleans itself up.
    if (total === 1) await redis.expire(key, 36 * 60 * 60);
  } catch {
    // Not worth failing a delivered message over.
  }
}

export interface BatchOutcome {
  sent: number;
  failed: number;
  /** True when there is more to do and another batch should be scheduled. */
  more: boolean;
  /** The rail said we are going too fast; the next gap should be longer. */
  backOff?: boolean;
}

/**
 * Send one batch of a campaign.
 *
 * Returns whether to come back. Everything that should STOP a campaign -
 * cancellation, an empty queue, the daily cap, a rail that is down - returns
 * `more: false` rather than throwing, so the scheduler does not retry its way
 * through a problem that needs a person.
 */
export async function runCampaignBatch(campaignId: string): Promise<BatchOutcome> {
  const campaign = await prisma.whatsAppCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status !== WhatsAppCampaignStatus.SENDING) {
    return { sent: 0, failed: 0, more: false };
  }

  // The cap is checked per batch, not per campaign, because it is a ceiling on
  // what the ACCOUNT sends in a day across everything.
  const already = await sentToday();
  if (already >= config.whatsapp.outreachDailyCap) {
    console.warn(
      `[campaign] daily outreach cap reached (${already}/${config.whatsapp.outreachDailyCap}) - ` +
        `${campaign.name} pauses until tomorrow`,
    );
    // Deliberately still SENDING and still scheduled: the campaign resumes on
    // its own once the day rolls over, rather than needing somebody to notice.
    return { sent: 0, failed: 0, more: true };
  }

  const batch = await prisma.whatsAppCampaignRecipient.findMany({
    where: { campaignId, status: WhatsAppRecipientStatus.QUEUED },
    orderBy: { createdAt: 'asc' },
    take: Math.min(BATCH_SIZE, config.whatsapp.outreachDailyCap - already),
  });
  if (batch.length === 0) return { sent: 0, failed: 0, more: false };

  const variables = Array.isArray(campaign.variables) ? (campaign.variables as string[]) : [];
  let sent = 0;
  let failed = 0;
  let rateLimited = false;

  // Names for this batch only, and only when the body actually asks for one.
  // A campaign that greets nobody should not be querying the users table once
  // per batch for the whole of its run.
  const namesById = new Map<string, string>();
  if (usesName(campaign.body)) {
    const userIds = batch.map((recipient) => recipient.userId).filter((id): id is string => !!id);
    if (userIds.length) {
      const people = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, fullName: true },
      });
      for (const person of people) namesById.set(person.id, person.fullName);
    }
  }

  for (const recipient of batch) {
    const body = campaign.body
      ? personalise(campaign.body, recipient.userId ? namesById.get(recipient.userId) : null)
      : null;

    const result = await sendCampaignMessage(recipient.phone, {
      template: campaign.template,
      language: campaign.language,
      variables,
      body,
    });

    // A transient refusal means nothing reached this person, so they stay
    // QUEUED and are tried again - capped, or a rail that keeps refusing would
    // retry the same person for ever. Only a real refusal, or giving up, is
    // recorded as a failure.
    const attempts = recipient.attempts + 1;
    const requeue = !result.ok && result.transient === true && attempts < MAX_ATTEMPTS;

    await prisma.whatsAppCampaignRecipient.update({
      where: { id: recipient.id },
      data: result.ok
        ? {
            status: WhatsAppRecipientStatus.SENT,
            waMessageId: result.messageId ?? null,
            sentAt: new Date(),
            attempts,
            error: null,
          }
        : requeue
          ? {
              status: WhatsAppRecipientStatus.QUEUED,
              attempts,
              // Kept so an operator watching a slow campaign can see WHY it is
              // slow, rather than seeing nothing happen.
              error: result.error ?? 'waiting to retry',
            }
          : {
              status: WhatsAppRecipientStatus.FAILED,
              attempts,
              error: result.error ?? 'send refused',
            },
    });

    // Counted only on a terminal outcome. Incrementing on a transient refusal
    // would make failedCount climb past the audience size as rows are retried.
    if (result.ok || !requeue) {
      await prisma.whatsAppCampaign.update({
        where: { id: campaignId },
        data: result.ok ? { sentCount: { increment: 1 } } : { failedCount: { increment: 1 } },
      });
    }

    if (result.ok) {
      sent += 1;
      await countSend();
      // The same log the assistant writes, so a campaign message appears in the
      // conversation view alongside everything else that number received.
      await prisma.whatsAppMessage.create({
        data: {
          phone: recipient.phone,
          userId: recipient.userId,
          direction: 'OUTBOUND',
          waMessageId: result.messageId ?? null,
          kind: 'campaign',
          // The personalised text, not the template - this log is what an
          // operator reads when somebody asks "what did you send me?".
          body: body ?? `[campaign: ${campaign.name}] ${campaign.template}`,
        },
      });
    } else if (requeue) {
      // Not a failure - the person is still in the queue. Backing off the whole
      // campaign is the right response: being rate limited means we are going
      // too fast, and the next message would hit the same wall.
      rateLimited = true;
      console.warn(
        `[campaign] ${campaign.name}: rate limited, ${recipient.phone.slice(-4)} requeued` +
          ` (attempt ${attempts}/${MAX_ATTEMPTS})`,
      );
    } else {
      failed += 1;
      if (result.fatal) {
        // The rail itself is broken - a dropped session, a dead key, a template
        // that does not exist. Every remaining recipient fails the same way, so
        // the campaign stops with its queue intact and can be resumed once the
        // problem is fixed, rather than burning the audience into FAILED rows.
        console.error(`[campaign] ${campaign.name} halted - ${result.error}`);
        await prisma.whatsAppCampaign.update({
          where: { id: campaignId },
          data: { status: WhatsAppCampaignStatus.CANCELLED, finishedAt: new Date() },
        });
        void emitAdminEvent({
          type: 'SYSTEM',
          severity: 'CRITICAL',
          title: 'Campaign stopped: the WhatsApp rail refused',
          body:
            `"${campaign.name}" stopped after ${campaign.sentCount + sent} message(s): ${result.error}. ` +
            'The remaining recipients were not messaged and are still queued. Fix the rail, then start a new campaign for the rest.',
          permission: 'outreach.send',
          link: '/whatsapp-outreach',
        });
        return { sent, failed, more: false };
      }
    }
  }

  const remaining = await prisma.whatsAppCampaignRecipient.count({
    where: { campaignId, status: WhatsAppRecipientStatus.QUEUED },
  });
  return { sent, failed, more: remaining > 0, backOff: rateLimited };
}

/** Close a campaign that has nothing left to send. */
export async function finishCampaign(campaignId: string): Promise<void> {
  // Only close one that is still SENDING: a cancellation already set its own
  // terminal status and must not be overwritten with SENT.
  await prisma.whatsAppCampaign.updateMany({
    where: { id: campaignId, status: WhatsAppCampaignStatus.SENDING },
    data: { status: WhatsAppCampaignStatus.SENT, finishedAt: new Date() },
  });
}
