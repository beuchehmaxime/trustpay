import { prisma } from './prisma';
import { retentionSettings } from './system-settings';

/**
 * Data retention.
 *
 * Only WhatsApp chat logs ever expired. Everything else - sessions, login
 * attempts, notifications, read support tickets - was kept for ever, which is
 * storage limitation failed on one side and, at the same time, no help at all
 * on the other: CEMAC wants financial records kept for YEARS, and keeping
 * everything indefinitely is not the same as keeping the right things.
 *
 * Two rules decide what appears here, and the second one matters more:
 *
 * **Nothing financial or evidential is ever deleted by a schedule.** Wallet
 * transactions, transfers, contracts, escrow, AML cases, audit logs and KYC
 * records are all absent from this file on purpose. They are the record a
 * regulator, a court or a defrauded customer would ask for, and a cron job that
 * quietly erases them is a far worse failure than keeping them too long.
 * Deleting those belongs to an explicit, reviewed erasure request, not to a
 * timer running at 4am.
 *
 * **What goes is operational exhaust.** Rows whose usefulness genuinely decays:
 * an expired session, a login attempt from last year, a notification somebody
 * read months ago. Holding those indefinitely adds risk and tells nobody
 * anything.
 */

export interface PurgeOutcome {
  /** What was cleared, for the log and for an auditor asking what runs. */
  table: string;
  deleted: number;
  keptDays: number;
}

/** Days → a cutoff date, which is the only arithmetic any of these need. */
function cutoff(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * Run every retention rule. Returns what each one did, so the scheduler can say
 * so out loud - a deletion job that runs silently is one nobody notices has
 * stopped running, or has started deleting far more than it should.
 */
export async function runRetention(): Promise<PurgeOutcome[]> {
  const settings = retentionSettings();
  if (!settings.enabled) return [];

  const outcomes: PurgeOutcome[] = [];

  // Expired and revoked sessions. A session row that can no longer authenticate
  // anyone is a list of devices and addresses with no purpose left.
  const sessions = await prisma.session.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: cutoff(settings.expiredSessionDays) } },
        { revokedAt: { lt: cutoff(settings.expiredSessionDays) } },
      ],
    },
  });
  outcomes.push({ table: 'sessions', deleted: sessions.count, keptDays: settings.expiredSessionDays });

  // Refresh tokens follow their sessions.
  const refreshTokens = await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: cutoff(settings.expiredSessionDays) } },
  });
  outcomes.push({
    table: 'refresh_tokens',
    deleted: refreshTokens.count,
    keptDays: settings.expiredSessionDays,
  });

  // Login attempts. Valuable for spotting a brute-force run THIS week; of no
  // value at all a year later, while remaining a record of when a named person
  // signed in from where.
  const loginAttempts = await prisma.loginAttempt.deleteMany({
    where: { createdAt: { lt: cutoff(settings.loginAttemptDays) } },
  });
  outcomes.push({
    table: 'login_attempts',
    deleted: loginAttempts.count,
    keptDays: settings.loginAttemptDays,
  });

  // Notifications the user has already read. An unread one is left alone
  // however old: deleting something a person has not yet seen is losing a
  // message, not applying a retention policy.
  const notifications = await prisma.notification.deleteMany({
    where: { readAt: { not: null }, createdAt: { lt: cutoff(settings.readNotificationDays) } },
  });
  outcomes.push({
    table: 'notifications',
    deleted: notifications.count,
    keptDays: settings.readNotificationDays,
  });

  // Raw visitor events. By far the highest-volume rows the product writes, and
  // the fastest to lose value: nobody asks what a page view did last year. The
  // aggregates already computed from them are unaffected.
  const analyticsEvents = await prisma.analyticsEvent.deleteMany({
    where: { createdAt: { lt: cutoff(settings.analyticsEventDays) } },
  });
  outcomes.push({
    table: 'analytics_events',
    deleted: analyticsEvents.count,
    keptDays: settings.analyticsEventDays,
  });

  return outcomes;
}

/**
 * What this schedule will NOT touch, and why - stated in code so the next
 * person to add a rule has to think about it rather than assume the omission
 * was an oversight.
 */
export const RETAINED_INDEFINITELY = [
  'wallet_transactions, transfers, contracts, milestones - the financial record CEMAC requires',
  'audit_logs - who did what, which is the evidence for every other control',
  'aml_alerts, kyc_records, kyc_documents - compliance decisions and what they were based on',
  'users - deleting an account is an erasure request, reviewed, not a timer',
] as const;
