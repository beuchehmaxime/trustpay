'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useNotifyActions, useNotifyFeed } from '@/features/notifyadmin/hooks';
import { SEVERITY_TONE, TYPE_META, timeAgo } from '@/features/notifyadmin/notifyadmin-ui';
import type { AdminNotification } from '@/features/notifyadmin/types';

/**
 * Top-bar notification bell: a polled feed of RBAC-scoped operator events with
 * an unread badge and a dropdown. Every operator has one; its contents are
 * scoped server-side to the permissions the operator holds.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { data, isLoading } = useNotifyFeed();
  const { markRead, markAllRead } = useNotifyActions();

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  function onOpen(notification: AdminNotification) {
    if (!notification.read) markRead.mutate(notification.id);
    setOpen(false);
    if (notification.link) router.push(notification.link);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Notifications"
        className={cn(
          'relative flex size-9 items-center justify-center rounded-lg border border-hairline text-muted-foreground transition-colors hover:bg-muted hover:text-ink',
          open && 'bg-muted text-ink',
        )}
      >
        <Bell className="size-4.5" />
        {unread > 0 ? (
          <span className="absolute -top-1 -right-1 flex min-w-4.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white tabular-nums ring-2 ring-surface">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          {/* Click-away backdrop */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-hairline bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
              <p className="text-sm font-semibold text-ink">
                Notifications
                {unread > 0 ? (
                  <span className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
                    {unread} new
                  </span>
                ) : null}
              </p>
              {unread > 0 ? (
                <button
                  type="button"
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:opacity-80 disabled:opacity-50"
                >
                  <CheckCheck className="size-3.5" /> Mark all read
                </button>
              ) : null}
            </div>

            <div className="max-h-[26rem] overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                  <Bell className="size-7 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">You’re all caught up.</p>
                </div>
              ) : (
                items.map((notification) => {
                  const meta = TYPE_META[notification.type];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => onOpen(notification)}
                      className={cn(
                        'flex w-full items-start gap-3 border-b border-hairline px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/50',
                        !notification.read && 'bg-brand-50/40',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
                          SEVERITY_TONE[notification.severity],
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[13px] font-semibold text-ink">
                            {notification.title}
                          </p>
                          {!notification.read ? (
                            <span className="size-2 shrink-0 rounded-full bg-brand-500" />
                          ) : null}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {notification.body}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground/70">
                          {timeAgo(notification.createdAt)}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block border-t border-hairline px-4 py-2.5 text-center text-xs font-semibold text-brand-600 hover:bg-muted/50"
            >
              View all notifications
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
