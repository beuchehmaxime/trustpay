'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Lock, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { normaliseError } from '@/lib/api/client';
import { usePermission } from '@/lib/auth/permissions';
import { dormancyApi, type DormantCandidate } from './dormancy.api';

/**
 * Dormant accounts, and the one button that deletes them.
 *
 * Deliberately not a one-click action. Nothing on this screen happens on a
 * timer: the schedule only ever finds candidates and warns them, and deletion
 * waits here until a person with `accounts.purge` selects accounts by name and
 * re-enters their own password.
 *
 * Candidates still inside their notice period are shown too, greyed and
 * unselectable. Hiding them would make the list look like "these are ready" when
 * most of them are not, and seeing the queue build is how an operator notices a
 * rule is catching more people than they expected - before anything is deleted.
 */

const REASON_LABEL: Record<DormantCandidate['reason'], string> = {
  NEVER_VERIFIED: 'Never verified',
  NEVER_ACTIVE: 'Verified, never used',
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function DormantAccountsPanel() {
  const canPurge = usePermission('accounts.purge');
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');

  const review = useQuery({
    queryKey: ['admin', 'dormant-accounts'],
    queryFn: () => dormancyApi.review(),
    enabled: canPurge,
  });

  const purge = useMutation({
    mutationFn: () => dormancyApi.purge([...selected], password),
    onSuccess: (result) => {
      setConfirming(false);
      setPassword('');
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ['admin', 'dormant-accounts'] });
      if (result.refused > 0) {
        // Named rather than counted: a refusal means the account turned out to
        // have history, and that is worth reading rather than glossing.
        toast.warning(`${result.deleted} deleted, ${result.refused} refused`, {
          description: result.results
            .filter((entry) => !entry.deleted)
            .map((entry) => `${entry.name || entry.userId}: ${entry.reason}`)
            .join(' · '),
        });
      } else {
        toast.success(`${result.deleted} account${result.deleted === 1 ? '' : 's'} deleted.`);
      }
    },
    onError: (error) => toast.error(normaliseError(error).message),
  });

  if (!canPurge) {
    return (
      <section className="rounded-lg border border-hairline bg-surface p-6 shadow-card">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Lock className="size-4 text-muted-foreground" /> Dormant accounts
        </div>
        <p className="mt-2 max-w-2xl text-[13px] text-muted-foreground">
          Deleting accounts needs the{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-[12px]">accounts.purge</code>{' '}
          permission, which is granted separately from the rest of Settings because it is the only
          action here that destroys data.
        </p>
      </section>
    );
  }

  const candidates = review.data?.candidates ?? [];
  const eligible = candidates.filter((candidate) => candidate.eligible);
  const waiting = candidates.filter((candidate) => !candidate.eligible);
  const rules = review.data?.rules;

  function toggle(userId: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-hairline bg-surface p-6 shadow-card">
        <h2 className="text-sm font-semibold text-ink">Dormant accounts</h2>
        <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
          {rules ? (
            <>
              Accounts that never verified are closed {rules.unverifiedDays} days after signup;
              accounts that verified and then never did anything are closed {rules.inactiveDays}{' '}
              days after signup. Everyone is warned {rules.notices.length} times first -{' '}
              {rules.notices.join(', ')} days before the date - and an account that has not had every
              warning is never deleted, however long it has been waiting.
            </>
          ) : (
            'Loading the rules…'
          )}
        </p>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
          Nothing here happens automatically. An account that has ever held a balance, moved money
          or joined a deal is never a candidate, and that is checked again at the moment you
          confirm.
        </p>
        {review.data && !review.data.warningsEnabled ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-[12.5px] leading-relaxed text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <span>
              Warnings are switched OFF, so nobody is being told their account will close and
              nothing can become deletable. The list below is what WOULD be affected. Turn warnings
              on under Verification settings once you are happy with it.
            </span>
          </p>
        ) : null}
      </div>

      {review.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : review.isError ? (
        <p className="py-8 text-center text-sm text-destructive">
          {normaliseError(review.error).message}
        </p>
      ) : candidates.length === 0 ? (
        <p className="rounded-lg border border-dashed border-hairline py-12 text-center text-sm text-muted-foreground">
          No account currently meets either rule.
        </p>
      ) : (
        <>
          {eligible.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-card">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-6 py-4">
                <div>
                  <h3 className="text-sm font-semibold text-ink">
                    Ready to delete ({eligible.length})
                  </h3>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                    Warned three times and past their closure date.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSelected(
                        selected.size === eligible.length
                          ? new Set()
                          : new Set(eligible.map((candidate) => candidate.userId)),
                      )
                    }
                    className="rounded-lg border border-hairline px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground transition hover:text-ink"
                  >
                    {selected.size === eligible.length ? 'Clear selection' : 'Select all'}
                  </button>
                  <button
                    type="button"
                    disabled={selected.size === 0}
                    onClick={() => setConfirming(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition hover:opacity-95 disabled:opacity-40"
                  >
                    <Trash2 className="size-3.5" />
                    Delete {selected.size > 0 ? selected.size : ''}
                  </button>
                </div>
              </header>
              <ul>
                {eligible.map((candidate) => (
                  <li
                    key={candidate.userId}
                    className="flex items-center gap-4 border-b border-hairline px-6 py-3.5 last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(candidate.userId)}
                      onChange={() => toggle(candidate.userId)}
                      aria-label={`Select ${candidate.fullName}`}
                      className="size-4 shrink-0 accent-[var(--color-brand-600)]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{candidate.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {candidate.phone ?? candidate.email ?? 'no contact on file'}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {REASON_LABEL[candidate.reason]}
                    </span>
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                      joined {formatDate(candidate.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {waiting.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-card">
              <header className="border-b border-hairline px-6 py-4">
                <h3 className="text-sm font-semibold text-ink">
                  Still being warned ({waiting.length})
                </h3>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                  Not selectable. These become deletable once every warning has gone out and their
                  date has passed.
                </p>
              </header>
              <ul>
                {waiting.map((candidate) => (
                  <li
                    key={candidate.userId}
                    className="flex items-center gap-4 border-b border-hairline px-6 py-3 opacity-70 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{candidate.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {REASON_LABEL[candidate.reason]} · closes {formatDate(candidate.scheduledFor)}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {candidate.noticesSent} of {rules?.notices.length ?? 3} warnings sent
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}

      {confirming ? (
        <ConfirmDialog
          count={selected.size}
          names={eligible
            .filter((candidate) => selected.has(candidate.userId))
            .map((candidate) => candidate.fullName)}
          password={password}
          onPassword={setPassword}
          pending={purge.isPending}
          onCancel={() => {
            setConfirming(false);
            setPassword('');
          }}
          onConfirm={() => purge.mutate()}
        />
      ) : null}
    </section>
  );
}

/**
 * The last thing between an operator and a permanent deletion.
 *
 * It names the accounts rather than only counting them, and the password field
 * is the operator's own. Both exist for the same reason: the realistic failure
 * is not somebody malicious, it is somebody tired clicking through a dialog on
 * a screen they left unlocked.
 */
function ConfirmDialog({
  count,
  names,
  password,
  onPassword,
  pending,
  onCancel,
  onConfirm,
}: {
  count: number;
  names: string[];
  password: string;
  onPassword: (value: string) => void;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-xl border border-hairline bg-surface p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-ink">
              Delete {count} account{count === 1 ? '' : 's'}?
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              This cannot be undone. The accounts and everything belonging to them are removed; the
              audit log keeps a record of who was deleted and by whom.
            </p>
          </div>
        </div>

        <ul className="mt-4 max-h-32 overflow-y-auto rounded-lg bg-muted/50 px-3 py-2 text-[12.5px] text-ink">
          {names.map((name) => (
            <li key={name} className="truncate py-0.5">
              {name}
            </li>
          ))}
        </ul>

        <label className="mt-4 block">
          <span className="text-[12.5px] font-medium text-ink">Confirm with your password</span>
          <input
            type="password"
            value={password}
            autoFocus
            autoComplete="current-password"
            onChange={(event) => onPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && password && !pending) onConfirm();
            }}
            className="mt-1.5 h-10 w-full rounded-lg border border-field bg-white px-3 text-sm text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-lg border border-hairline px-4 py-2 text-[13px] font-medium text-muted-foreground transition hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!password || pending}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-95',
              (!password || pending) && 'opacity-50',
            )}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}
