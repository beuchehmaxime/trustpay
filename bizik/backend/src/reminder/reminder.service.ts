import { prisma } from '../lib/prisma';
import { NotificationService } from '../notification/notification.service';

/**
 * Delivery-date reminders. Once a day the scheduler asks this service to notify
 * both parties of any milestone whose delivery date is TOMORROW, so nobody is
 * caught off guard the day a deliverable is due. Each milestone is reminded at
 * most once (tracked by `dueReminderSentAt`).
 */

/** Statuses where a delivery is still expected (work not yet submitted/closed). */
const OPEN_STATUSES = ['PENDING', 'FUNDED', 'ACTIVE'] as const;

/** UTC day window [start, end) for the calendar day `daysFromNow` days ahead. */
function dayWindow(daysFromNow: number): { start: Date; end: Date } {
  const base = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export const ReminderService = {
  /**
   * Send delivery reminders for every open milestone due tomorrow that hasn't
   * been reminded yet. Returns how many reminders were sent.
   */
  async runDueSoonReminders(): Promise<{ reminded: number }> {
    const { start, end } = dayWindow(1); // tomorrow

    const dueMilestones = await prisma.milestone.findMany({
      where: {
        deadline: { gte: start, lt: end },
        dueReminderSentAt: null,
        status: { in: [...OPEN_STATUSES] },
      },
      select: {
        id: true,
        title: true,
        deadline: true,
        contract: {
          select: {
            id: true,
            title: true,
            creatorId: true,
            counterpartyId: true,
            counterpartyName: true,
            counterpartyEmail: true,
          },
        },
      },
    });

    let reminded = 0;
    for (const milestone of dueMilestones) {
      const dueLabel = (milestone.deadline ?? start).toISOString().slice(0, 10);
      await NotificationService.notifyDeliveryDue({
        contract: milestone.contract,
        milestoneTitle: milestone.title,
        dueLabel,
      });
      // Mark as reminded so a second run the same day can't double-notify.
      await prisma.milestone.update({
        where: { id: milestone.id },
        data: { dueReminderSentAt: new Date() },
      });
      reminded += 1;
    }

    console.log(`[reminder] delivery reminders sent: ${reminded}`);
    return { reminded };
  },
};
