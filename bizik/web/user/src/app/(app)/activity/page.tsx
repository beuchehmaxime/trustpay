'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  BadgeCheck,
  Banknote,
  Bell,
  CheckCheck,
  Handshake,
  Inbox,
  Loader2,
  Lock,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';

import {
  useNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from '@/lib/hooks/use-notifications';
import type { AppNotification, NotificationCategory } from '@/lib/api/notifications.api';
import { cn } from '@/lib/utils';

/** Filter tabs mirror the existing design; each non-meta tab maps to a category. */
type FilterKey = 'all' | 'unread' | 'deal' | 'money' | 'dispute' | 'identity' | 'security';

const FILTERS: FilterKey[] = ['all', 'unread', 'deal', 'money', 'dispute', 'identity', 'security'];

/** Which backend category each category-filter tab selects. */
const FILTER_CATEGORY: Record<Exclude<FilterKey, 'all' | 'unread'>, NotificationCategory> = {
  deal: 'CONTRACT',
  money: 'PAYMENT',
  dispute: 'DISPUTE',
  identity: 'KYC',
  security: 'SECURITY',
};

const TONE: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-600',
  positive: 'bg-positive-bg text-positive-text',
  negative: 'bg-negative-bg text-negative',
  warning: 'bg-warning-bg text-warning-text',
  cyan: 'bg-cyan-bg text-cyan-text',
  neutral: 'bg-muted text-muted-foreground',
};

/** Map a notification category onto an icon + colour tone. */
const CATEGORY_META: Record<NotificationCategory, { icon: LucideIcon; tone: keyof typeof TONE }> = {
  PAYMENT: { icon: Banknote, tone: 'positive' },
  CONTRACT: { icon: Handshake, tone: 'brand' },
  KYC: { icon: BadgeCheck, tone: 'cyan' },
  DISPUTE: { icon: ShieldAlert, tone: 'negative' },
  SECURITY: { icon: Lock, tone: 'neutral' },
  SYSTEM: { icon: Bell, tone: 'neutral' },
};

export default function ActivityPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const notificationsQuery = useNotifications();
  const markAll = useMarkAllNotificationsRead();
  const markOne = useMarkNotificationRead();
  const [filter, setFilter] = useState<FilterKey>('all');

  const items = useMemo(() => notificationsQuery.data ?? [], [notificationsQuery.data]);
  const unreadTotal = useMemo(() => items.filter((item) => !item.read).length, [items]);

  const countFor = (key: FilterKey) => {
    if (key === 'all') return items.length;
    if (key === 'unread') return unreadTotal;
    return items.filter((item) => item.category === FILTER_CATEGORY[key]).length;
  };

  const visible = items.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !item.read;
    return item.category === FILTER_CATEGORY[filter];
  });

  const markAllRead = () => {
    if (unreadTotal > 0) markAll.mutate();
  };

  const openNotification = (notification: AppNotification) => {
    if (!notification.read) markOne.mutate(notification.id);
    router.push(`/activity/${notification.id}`);
  };

  /** Relative "time ago" label from an ISO timestamp. */
  const relativeTime = (iso: string) => {
    const elapsedMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(elapsedMs / 60_000);
    if (minutes < 1) return t('activity.time.now');
    if (minutes < 60) return t('activity.time.minutesAgo', { n: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('activity.time.hoursAgo', { n: hours });
    const days = Math.floor(hours / 24);
    return days === 1 ? t('activity.time.dayAgo', { n: days }) : t('activity.time.daysAgo', { n: days });
  };

  return (
    <div className="w-full space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-ink">
            {unreadTotal > 0 ? t('activity.unreadCount', { count: unreadTotal }) : t('activity.allCaughtUp')}
          </p>
          <p className="text-[12.5px] text-muted-foreground">{t('activity.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={markAllRead}
          disabled={unreadTotal === 0 || markAll.isPending}
          className={cn(
            'flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold transition',
            unreadTotal > 0
              ? 'border-hairline bg-surface text-brand-700 hover:border-brand-border hover:bg-brand-50'
              : 'cursor-not-allowed border-hairline bg-surface text-subtle',
          )}
        >
          <CheckCheck className="size-4" />
          {t('activity.markAllRead')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((key) => {
          const active = filter === key;
          const count = countFor(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                'flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition',
                active
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-hairline bg-surface text-muted-foreground hover:border-brand-border hover:text-ink',
              )}
            >
              {t(`activity.filter.${key}`)}
              <span
                className={cn(
                  'rounded-full px-1.5 text-[11px] font-bold',
                  active ? 'bg-brand-600 text-white' : 'bg-muted text-muted-foreground',
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* List */}
      <section className="shadow-card w-full overflow-hidden rounded-2xl border border-hairline bg-surface">
        {notificationsQuery.isLoading ? (
          <div className="flex items-center justify-center px-6 py-16">
            <Loader2 className="size-6 animate-spin text-brand-500" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Inbox className="size-6" />
            </span>
            <p className="mt-3 text-sm font-bold text-ink">{t('activity.emptyTitle')}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">{t('activity.emptyBody')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#F1F5FA]">
            {visible.map((item) => {
              const meta = CATEGORY_META[item.category];
              const unread = !item.read;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(item)}
                    className={cn(
                      'flex w-full items-start gap-4 px-5 py-4 text-left transition hover:bg-muted/50',
                      unread && 'bg-brand-50/25',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full',
                        TONE[meta.tone],
                      )}
                    >
                      <meta.icon className="size-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-ink">{item.title}</p>
                      <p className="text-body mt-0.5 text-[13px] leading-relaxed">{item.body}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 pl-2">
                      <span className="whitespace-nowrap text-[11.5px] text-muted-foreground">
                        {relativeTime(item.createdAt)}
                      </span>
                      {unread ? <span className="size-2 rounded-full bg-brand-500" /> : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
