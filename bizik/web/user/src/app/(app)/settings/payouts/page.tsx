'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ChevronRight,
  Globe,
  Landmark,
  Loader2,
  MoreVertical,
  Plus,
  Smartphone,
  Star,
  Trash2,
  type LucideIcon,
} from 'lucide-react';

import { ProviderLogo } from '@/components/ui/provider-logo';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import type { PayoutBadge, PayoutKind } from '@/lib/demo/settings';
import type { PayoutMethod } from '@/lib/api/wallet.api';
import {
  usePayoutMethods,
  useRemovePayoutMethod,
  useSetDefaultPayoutMethod,
} from '@/lib/hooks/use-payouts';
import { normaliseError } from '@/lib/api/client';
import { cn } from '@/lib/utils';

const KIND_ICON: Record<PayoutKind, LucideIcon> = {
  momo: Smartphone,
  bank: Landmark,
  payoneer: Globe,
};

const KIND_TILE: Record<PayoutKind, string> = {
  momo: 'bg-warning-bg text-warning-text',
  bank: 'bg-brand-50 text-brand-600',
  payoneer: 'bg-cyan-bg text-cyan-text',
};

const BADGE_TONE: Record<PayoutBadge, StatusTone> = {
  default: 'brand',
  verified: 'positive',
  pending: 'warning',
};

/** Backend gives `isDefault` + `verified`; collapse them into a single badge. */
function badgeFor(method: PayoutMethod): PayoutBadge {
  if (method.isDefault) return 'default';
  if (!method.verified) return 'pending';
  return 'verified';
}

/** Coarse category → icon/tile fallback (backend `kind` should already match). */
function kindOf(method: PayoutMethod): PayoutKind {
  return (KIND_ICON[method.kind as PayoutKind] ? method.kind : 'bank') as PayoutKind;
}

export default function PayoutsPage() {
  const { t } = useTranslation();
  const { data: methods, isLoading, isError, refetch } = usePayoutMethods();
  const setDefault = useSetDefaultPayoutMethod();
  const removeMethod = useRemovePayoutMethod();

  function handleSetDefault(id: string) {
    setDefault.mutate(id, {
      onSuccess: () => toast.success(t('settings.payouts.defaultSet')),
      onError: (error) => toast.error(normaliseError(error).message || t('settings.payouts.actionError')),
    });
  }

  function handleRemove(id: string) {
    removeMethod.mutate(id, {
      onSuccess: () => toast.success(t('settings.payouts.removed')),
      onError: (error) => toast.error(normaliseError(error).message || t('settings.payouts.actionError')),
    });
  }

  const busy = setDefault.isPending || removeMethod.isPending;
  const list = methods ?? [];

  return (
    <>
      {/* ── Desktop: wide card, 2-column methods, Add button in header ── */}
      <section className="shadow-card hidden rounded-2xl border border-hairline bg-surface p-6 md:block">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold text-ink">{t('settings.payouts.title')}</h1>
          <Link
            href="/settings/payouts/new"
            className="bg-primary shadow-brand flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-95"
          >
            <Plus className="size-4" />
            {t('settings.payouts.addMethod')}
          </Link>
        </div>

        {isLoading ? (
          <ListSpinner />
        ) : isError ? (
          <ListError onRetry={() => refetch()} />
        ) : list.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-4">
            {list.map((method) => {
              const kind = kindOf(method);
              const Icon = KIND_ICON[kind];
              const badge = badgeFor(method);
              return (
                <div
                  key={method.id}
                  className={cn(
                    'relative rounded-2xl border p-4 transition',
                    method.isDefault ? 'border-brand-500 bg-brand-50/30' : 'border-hairline hover:border-brand-border',
                  )}
                >
                  <div className="flex items-start gap-3">
                    {kind === 'momo' ? (
                      <ProviderLogo type={method.type} size={40} />
                    ) : (
                      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', KIND_TILE[kind])}>
                        <Icon className="size-[18px]" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      {kind === 'momo' ? (
                        <>
                          <p className="text-[14px] font-bold text-ink">{method.detail}</p>
                          {method.currency ? (
                            <p className="text-[12px] text-muted-foreground">{method.currency}</p>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <p className="text-[14px] font-bold text-ink">{method.name}</p>
                          <p className="text-[12px] text-muted-foreground">
                            {method.detail}
                            {method.currency ? ` · ${method.currency}` : ''}
                          </p>
                        </>
                      )}
                    </div>
                    <MethodMenu
                      method={method}
                      disabled={busy}
                      onSetDefault={() => handleSetDefault(method.id)}
                      onRemove={() => handleRemove(method.id)}
                    />
                  </div>
                  <div className="mt-3">
                    <StatusPill tone={BADGE_TONE[badge]}>{t(`settings.payouts.badge.${badge}`)}</StatusPill>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Mobile / PWA: single-column list ── */}
      <div className="mx-auto w-full max-w-[560px] space-y-4 md:hidden">
        {/* Full-width header band */}
        <div className="-mx-4 -mt-4 border-b border-hairline bg-surface px-4 pb-4 pt-5 md:mx-0 md:mt-0 md:rounded-2xl md:border md:px-6 md:pt-6">
          <h1 className="text-xl font-extrabold text-ink">{t('settings.payouts.title')}</h1>
        </div>

        {/* Method list */}
        {isLoading ? (
          <ListSpinner />
        ) : isError ? (
          <ListError onRetry={() => refetch()} />
        ) : list.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            {list.map((method) => {
              const kind = kindOf(method);
              const Icon = KIND_ICON[kind];
              const badge = badgeFor(method);
              return (
                <div
                  key={method.id}
                  className={cn(
                    'shadow-card flex items-center gap-3 rounded-2xl border bg-surface p-4 transition',
                    method.isDefault ? 'border-brand-500' : 'border-hairline hover:border-brand-border',
                  )}
                >
                  {kind === 'momo' ? (
                    <ProviderLogo type={method.type} size={44} />
                  ) : (
                    <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', KIND_TILE[kind])}>
                      <Icon className="size-5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    {kind === 'momo' ? (
                      <>
                        <p className="truncate text-[14.5px] font-bold text-ink">{method.detail}</p>
                        {method.currency ? (
                          <p className="truncate text-[12.5px] text-muted-foreground">{method.currency}</p>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <p className="truncate text-[14.5px] font-bold text-ink">{method.name}</p>
                        <p className="truncate text-[12.5px] text-muted-foreground">
                          {method.detail}
                          {method.currency ? ` · ${method.currency}` : ''}
                        </p>
                      </>
                    )}
                  </div>
                  <StatusPill tone={BADGE_TONE[badge]}>{t(`settings.payouts.badge.${badge}`)}</StatusPill>
                  <MethodMenu
                    method={method}
                    disabled={busy}
                    onSetDefault={() => handleSetDefault(method.id)}
                    onRemove={() => handleRemove(method.id)}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Add method */}
        <Link
          href="/settings/payouts/new"
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-brand-border bg-surface py-4 text-[14px] font-semibold text-brand-600 transition hover:bg-brand-50/40"
        >
          <Plus className="size-4.5" />
          {t('settings.payouts.addMethod')}
        </Link>
      </div>
    </>
  );
}

/** Small per-card action menu: set-default / remove (kept out of the row). */
function MethodMenu({
  method,
  disabled,
  onSetDefault,
  onRemove,
}: {
  method: PayoutMethod;
  disabled: boolean;
  onSetDefault: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={t('settings.payouts.title')}
        onClick={() => setOpen((value) => !value)}
        className="flex size-8 items-center justify-center rounded-lg text-subtle transition hover:bg-muted hover:text-ink"
      >
        <MoreVertical className="size-4" />
      </button>
      {open ? (
        <>
          {/* Click-away backdrop */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="shadow-card absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-xl border border-hairline bg-surface py-1">
            {!method.isDefault ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setOpen(false);
                  onSetDefault();
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-medium text-ink transition hover:bg-muted disabled:opacity-50"
              >
                <Star className="size-4 text-brand-600" />
                {t('settings.payouts.setDefault')}
              </button>
            ) : null}
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setOpen(false);
                onRemove();
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-medium text-negative transition hover:bg-negative-bg-soft disabled:opacity-50"
            >
              <Trash2 className="size-4" />
              {t('settings.payouts.remove')}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ListSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="size-6 animate-spin text-brand-500" />
    </div>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center">
      <Landmark className="size-8 text-subtle" />
      <p className="max-w-[280px] text-[13px] text-muted-foreground">{t('settings.payouts.empty')}</p>
    </div>
  );
}

function ListError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center">
      <p className="text-[13px] text-negative">{t('settings.payouts.loadError')}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-xl border border-hairline px-4 py-2 text-[13px] font-semibold text-ink transition hover:bg-muted"
      >
        {t('settings.payouts.retry')}
      </button>
    </div>
  );
}
