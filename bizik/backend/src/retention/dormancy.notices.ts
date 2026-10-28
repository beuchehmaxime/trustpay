import { DormancyReason } from '@prisma/client';

import { emitAdminEvent } from '../lib/admin-events';
import { prisma } from '../lib/prisma';
import { systemSettings } from '../lib/system-settings';
import { sendSmsMessage } from '../lib/sms';
import {
  type DormantCandidate,
  findCandidates,
  noticeDueFor,
  NOTICE_SCHEDULE,
} from './dormancy.service';

/**
 * Warning people before their account is deleted.
 *
 * Three warnings: two weeks out, one week out, and two days out. An account
 * that has not had all three is not eligible for deletion, so a failure here
 * delays a deletion rather than letting one happen unannounced. That ordering
 * is the whole point - the notice is not a courtesy wrapped around the
 * deletion, it is a precondition of it.
 *
 * Each warning is recorded as a row, which is both the proof that notice was
 * given and the idempotency key: the job runs daily and sends a stage only when
 * no row exists for it, so a retry or a restart cannot warn somebody twice.
 */

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * What the warning says.
 *
 * It leads with the action that stops it, because that is the only part the
 * reader needs. Somebody who has not verified needs to verify; somebody fully
 * verified who has never used the product just needs to sign in.
 */
function noticeText(candidate: DormantCandidate, stage: number): { title: string; body: string } {
  const when = formatDate(candidate.scheduledFor);
  const last = stage === NOTICE_SCHEDULE.length;
  const fix =
    candidate.reason === DormancyReason.NEVER_VERIFIED
      ? 'Finish verifying your identity in the app and your account stays open.'
      : 'Sign in and use your account once - send money, open a deal, anything - and it stays open.';

  return {
    title: last ? 'Final notice: your Bizik account closes soon' : 'Your Bizik account will be closed',
    body:
      `Your Bizik account has not been used since you created it, so it is scheduled to be closed on ${when}. ` +
      `${fix} ` +
      (last
        ? 'This is the last reminder we will send.'
        : 'If you do nothing, we will remind you again before then.'),
  };
}

/**
 * Send whichever warning is due today, to everybody who is due one.
 *
 * Never throws for a single failed send. One unreachable phone number must not
 * stop the rest of the run - and because an unsent stage leaves no row, that
 * person simply gets the warning on the next run instead, with their deletion
 * held back until they have had all three.
 */
export async function sendDueNotices(): Promise<{ sent: number; byStage: Record<number, number> }> {
  // Off by default. Nobody is told their account will be closed until an
  // operator has seen the list and switched this on - the review screen works
  // regardless, so the decision is made with the names in front of them.
  if (!systemSettings().retention.dormancyEnabled) return { sent: 0, byStage: {} };

  const candidates = await findCandidates();
  const byStage: Record<number, number> = {};
  let sent = 0;

  for (const candidate of candidates) {
    const stage = noticeDueFor(candidate);
    if (stage === null) continue;

    const { title, body } = noticeText(candidate, stage);
    let channel = 'none';

    try {
      // In-app first: it is the one channel that cannot fail for an address we
      // no longer have, and it is where somebody who does sign in will see it.
      await prisma.notification.create({
        data: {
          userId: candidate.userId,
          category: 'SYSTEM',
          title,
          body,
          channels: ['IN_APP'],
          // Account closure is not something a notification preference may
          // silence - it is the one message whose absence costs the account.
          isCritical: true,
        },
      });
      channel = 'in_app';

      if (candidate.phone) {
        // Reaches somebody who has not opened the app in months, which is the
        // definition of the audience here.
        await sendSmsMessage(
          candidate.phone,
          `${title}. ${body.slice(0, 220)}`,
        );
        channel = 'in_app+sms';
      }
    } catch (error) {
      console.warn(
        `[dormancy] could not warn ${candidate.userId} (stage ${stage}) - ${(error as Error).message}`,
      );
      // No row is written, so the deletion stays blocked and the warning is
      // retried tomorrow. Failing to warn must never advance the clock.
      continue;
    }

    try {
      await prisma.accountDormancyNotice.create({
        data: {
          userId: candidate.userId,
          reason: candidate.reason,
          stage,
          scheduledFor: candidate.scheduledFor,
          channel,
        },
      });
    } catch {
      // Unique constraint: another run already recorded this stage. The person
      // may have had a duplicate message, which is harmless; the alternative -
      // treating it as unsent - would warn them again tomorrow as well.
      continue;
    }

    sent += 1;
    byStage[stage] = (byStage[stage] ?? 0) + 1;
  }

  return { sent, byStage };
}

const ALERT_KEY_PREFIX = '[dormancy]';

/**
 * Tell operators there is something to review, once per day at most.
 *
 * Only when accounts are actually ELIGIBLE - fully warned and past their date.
 * Alerting while candidates are still inside their notice period would mean a
 * standing notification about something nobody should act on yet, which is the
 * fastest way to make the real one invisible.
 */
export async function alertOperatorsIfDue(): Promise<number> {
  const candidates = await findCandidates();
  const eligible = candidates.filter((candidate) => candidate.eligible);
  if (eligible.length === 0) return 0;

  const neverVerified = eligible.filter(
    (candidate) => candidate.reason === DormancyReason.NEVER_VERIFIED,
  ).length;

  console.log(`${ALERT_KEY_PREFIX} ${eligible.length} account(s) ready for review`);
  void emitAdminEvent({
    type: 'SYSTEM',
    severity: 'INFO',
    title: `${eligible.length} dormant account${eligible.length === 1 ? '' : 's'} ready for review`,
    body:
      `${eligible.length} account${eligible.length === 1 ? ' has' : 's have'} been warned three times and ` +
      `reached their closure date - ${neverVerified} never verified, ${eligible.length - neverVerified} verified but never used. ` +
      'Nothing is deleted automatically. Review them under Settings > Dormant accounts and confirm with your password.',
    permission: 'accounts.purge',
    link: '/settings',
  });

  return eligible.length;
}
