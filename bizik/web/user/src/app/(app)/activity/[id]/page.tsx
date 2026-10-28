'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Bell,
  BellOff,
  Handshake,
  Loader2,
  Lock,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';

import { useNotifications, useMarkNotificationRead } from '@/lib/hooks/use-notifications';
import type { AppNotification, NotificationCategory } from '@/lib/api/notifications.api';
import { cn } from '@/lib/utils';

const TONE: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-600',
  positive: 'bg-positive-bg text-positive-text',
  negative: 'bg-negative-bg text-negative',
  warning: 'bg-warning-bg text-warning-text',
  cyan: 'bg-cyan-bg text-cyan-text',
  neutral: 'bg-muted text-muted-foreground',
};

const CATEGORY_META: Record<NotificationCategory, { icon: LucideIcon; tone: keyof typeof TONE }> = {
  PAYMENT: { icon: Banknote, tone: 'positive' },
  CONTRACT: { icon: Handshake, tone: 'brand' },
  KYC: { icon: BadgeCheck, tone: 'cyan' },
  DISPUTE: { icon: ShieldAlert, tone: 'negative' },
  SECURITY: { icon: Lock, tone: 'neutral' },
  SYSTEM: { icon: Bell, tone: 'neutral' },
};

/** Full timestamp, e.g. "Tue, 12 Aug 2026, 14:05". */
function fullDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Where this notification can take the user next, if anywhere. */
function targetFor(
  notification: AppNotification,
): { href: string; labelKey: string } | null {
  if (notification.category === 'DISPUTE') {
    return { href: '/disputes', labelKey: 'activity.detail.viewDispute' };
  }
  if (notification.entityType === 'contract' && notification.entityId) {
    return { href: `/deals/${notification.entityId}`, labelKey: 'activity.detail.viewDeal' };
  }
  if (notification.category === 'KYC') {
    return { href: '/settings/kyc', labelKey: 'activity.detail.viewVerification' };
  }
  if (notification.category === 'SECURITY') {
    return { href: '/settings/security', labelKey: 'activity.detail.viewSecurity' };
  }
  if (notification.category === 'PAYMENT') {
    return { href: '/wallet', labelKey: 'activity.detail.viewWallet' };
  }
  return null;
}

export default function NotificationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const notificationsQuery = useNotifications();
  const markOne = useMarkNotificationRead();

  const notification = (notificationsQuery.data ?? []).find((entry) => entry.id === params.id);

  // Mark it read the first time we land on the detail (once).
  const markedRef = useRef(false);
  useEffect(() => {
    if (notification && !notification.read && !markedRef.current) {
      markedRef.current = true;
      markOne.mutate(notification.id);
    }
  }, [notification, markOne]);

  if (notificationsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!notification) {
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col items-center justify-center py-24 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <BellOff className="size-6" />
        </span>
        <p className="mt-3 text-sm font-bold text-ink">{t('activity.detail.notFound')}</p>
        <Link href="/activity" className="mt-3 text-[13px] font-semibold text-brand-700 hover:underline">
          ← {t('nav.activity')}
        </Link>
      </div>
    );
  }

  const meta = CATEGORY_META[notification.category] ?? CATEGORY_META.SYSTEM;
  const target = targetFor(notification);

  return (
    <div className="mx-auto w-full max-w-[560px] space-y-5">
      {/* Back link */}
      <Link
        href="/activity"
        className="flex w-fit items-center gap-1.5 text-[14px] font-semibold text-brand-700"
      >
        <ArrowLeft className="size-4" />
        {t('nav.activity')}
      </Link>

      <section className="shadow-card rounded-2xl border border-hairline bg-surface p-6 md:p-8">
        {/* Category badge */}
        <div className="flex flex-col items-center text-center">
          <span
            className={cn(
              'flex size-16 items-center justify-center rounded-full',
              TONE[meta.tone],
            )}
          >
            <meta.icon className="size-7" />
          </span>
          <span
            className={cn(
              'mt-3 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide',
              TONE[meta.tone],
            )}
          >
            {t(`activity.category.${notification.category}`)}
          </span>

          <h1 className="mt-4 text-xl font-extrabold tracking-[-0.3px] text-ink">{notification.title}</h1>
          <p className="mt-1 text-[12.5px] text-muted-foreground">{fullDate(notification.createdAt)}</p>
        </div>

        {/* Body */}
        <div className="mt-6 rounded-xl bg-muted/40 p-4">
          <p className="text-body text-[14px] leading-relaxed">{notification.body}</p>
        </div>

        {/* Contextual action */}
        {target ? (
          <button
            type="button"
            onClick={() => router.push(target.href)}
            className="bg-primary shadow-brand mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-white transition hover:opacity-95"
          >
            {t(target.labelKey)}
            <ArrowRight className="size-4" />
          </button>
        ) : null}
      </section>
    </div>
  );
}
