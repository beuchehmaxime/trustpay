'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, MessageCircle, Pause, Play } from 'lucide-react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { normaliseError } from '@/lib/api/client';
import { usePermission } from '@/lib/auth/permissions';
import { ConversationInbox } from '@/features/whatsapp/conversation-inbox';
import { useToggleWhatsApp, useWhatsAppOverview } from '@/features/whatsapp/hooks';
import type { WhatsAppDayVolume } from '@/features/whatsapp/types';
import { cn } from '@/lib/utils';

/**
 * The WhatsApp channel, for operators.
 *
 * The assistant now moves real money - deals, transfers, deposits, withdrawals
 * - and until this page existed the console could see none of it and had no way
 * to stop it short of an environment change and a redeploy.
 */
export default function WhatsAppPage() {
  const canManage = usePermission('whatsapp.manage');
  const overview = useWhatsAppOverview(14);
  const toggle = useToggleWhatsApp();
  const [confirmPause, setConfirmPause] = useState(false);

  if (overview.isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (overview.isError || !overview.data) {
    return (
      <p className="py-24 text-center text-sm text-muted-foreground">
        Could not load the WhatsApp channel.
      </p>
    );
  }

  const data = overview.data;
  const peak = Math.max(1, ...data.series.map((day) => day.inbound + day.outbound));

  const setEnabled = (enabled: boolean) =>
    toggle.mutate(enabled, {
      onSuccess: () => toast.success(enabled ? 'WhatsApp assistant resumed' : 'WhatsApp assistant paused'),
      onError: (error) => toast.error(normaliseError(error).message),
    });

  return (
    <div className="space-y-5">
      {/* ── State + kill switch ── */}
      <section className="shadow-card rounded-2xl border border-hairline bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-xl',
                data.enabled ? 'bg-positive-bg text-positive-text' : 'bg-muted text-muted-foreground',
              )}
            >
              <MessageCircle className="size-5" />
            </span>
            <div>
              <h1 className="text-lg font-extrabold text-ink">WhatsApp assistant</h1>
              <p className="text-[13px] text-muted-foreground">
                {data.enabled
                  ? 'Live - answering messages and moving money.'
                  : data.envEnabled
                    ? 'Paused by an operator. Inbound messages are ignored.'
                    : 'Not configured on this environment.'}
              </p>
            </div>
          </div>

          {canManage && data.envEnabled ? (
            data.enabled ? (
              <button
                type="button"
                onClick={() => setConfirmPause(true)}
                disabled={toggle.isPending}
                className="flex h-10 items-center gap-2 rounded-xl border border-negative-bg px-4 text-[13px] font-semibold text-negative transition hover:bg-negative-bg-soft disabled:opacity-60"
              >
                <Pause className="size-4" />
                Pause the assistant
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setEnabled(true)}
                disabled={toggle.isPending}
                className="bg-primary flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
              >
                <Play className="size-4" />
                Resume
              </button>
            )
          ) : null}
        </div>

        {!data.envEnabled ? (
          <p className="mt-4 flex gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="size-4 shrink-0 text-amber-600" />
            WhatsApp is switched off for this environment, so the toggle here cannot bring it up.
          </p>
        ) : null}
      </section>

      {/* ── Numbers ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Messages in (${data.windowDays}d)`} value={data.totals.inbound} />
        <Stat label={`Messages out (${data.windowDays}d)`} value={data.totals.outbound} />
        <Stat label="Active numbers" value={data.totals.activeNumbers} />
        <Stat
          label="Reachable now"
          value={data.channels.reachableNow}
          hint="Inside Meta's 24-hour window"
        />
      </div>

      {/* ── Volume ── */}
      <section className="shadow-card rounded-2xl border border-hairline bg-surface p-5">
        <h2 className="text-sm font-bold text-ink">Daily volume</h2>
        <div className="mt-5 flex h-36 items-end gap-1.5">
          {data.series.map((day: WhatsAppDayVolume) => {
            const total = day.inbound + day.outbound;
            return (
              <div key={day.date} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className="w-full rounded-t bg-brand-500/80"
                  style={{ height: `${Math.max(2, (total / peak) * 110)}px` }}
                  title={`${day.date}: ${day.inbound} in, ${day.outbound} out`}
                />
                <span className="text-[9px] text-subtle">{day.date.slice(8)}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Linked numbers ── */}
      <section className="shadow-card rounded-2xl border border-hairline bg-surface p-5">
        <h2 className="text-sm font-bold text-ink">Linked numbers</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-4">
          <Detail label="Linked" value={data.channels.linked} />
          <Detail label="With a PIN set" value={data.channels.withPin} />
          <Detail label="Locked" value={data.channels.locked} tone={data.channels.locked ? 'warn' : undefined} />
          <Detail label="Opted out" value={data.channels.optedOut} />
        </dl>
      </section>

      {/* ── Conversations ── */}
      <ConversationInbox />

      <ConfirmDialog
        open={confirmPause}
        onOpenChange={setConfirmPause}
        title="Pause the WhatsApp assistant?"
        description="Inbound messages will be ignored until you resume it."
        confirmLabel="Pause"
        destructive
        icon={Pause}
        consequencesTitle="What happens while it is paused"
        consequences={[
          'Users messaging the number get no reply at all.',
          'Deals and money already in flight are unaffected - only the chat stops.',
          'Nothing is lost: people can still use the app and the web dashboard.',
        ]}
        onConfirm={() => setEnabled(false)}
      />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="shadow-card rounded-2xl border border-hairline bg-surface p-4">
      <p className="text-[10.5px] font-bold uppercase tracking-wider text-subtle">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums text-ink">{value.toLocaleString()}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Detail({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'text-lg font-bold tabular-nums',
          tone === 'warn' ? 'text-warning-text' : 'text-ink',
        )}
      >
        {value.toLocaleString()}
      </dd>
    </div>
  );
}
