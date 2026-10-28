'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Lock, Pencil } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { normaliseError } from '@/lib/api/client';
import { usePermission } from '@/lib/auth/permissions';
import { useFeesConfig, useUpdateFees, useUpdateFxRate } from '@/features/fees/hooks';
import type { FeeSchedule, FxRate } from '@/features/fees/types';

function pct(fraction: number): string {
  return `${(fraction * 100).toLocaleString('en-US', { maximumFractionDigits: 3 })}%`;
}

function usd(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

const FEE_ROWS: { key: keyof FeeSchedule; label: string; hint: string }[] = [
  { key: 'clientServicePct', label: 'Client service fee', hint: 'Charged to the payer at funding' },
  { key: 'freelancerFeePct', label: 'Freelancer fee', hint: 'Deducted from the payee at release' },
  { key: 'expressWithdrawalPct', label: 'Express withdrawal', hint: 'Surcharge for fast payouts' },
  { key: 'fxMarginPct', label: 'FX margin', hint: 'Applied below mid-market on conversion' },
];

export default function FeesPage() {
  const canView = usePermission('fees.view');
  const canManage = usePermission('fees.manage');
  const { data, isLoading, isError, error } = useFeesConfig();
  const [feesOpen, setFeesOpen] = useState(false);
  const [editRate, setEditRate] = useState<FxRate | null>(null);

  if (!canView) {
    return <NoAccess message="You don’t have permission to view fees & FX." />;
  }
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {isError ? normaliseError(error).message : 'Could not load fees.'}
      </div>
    );
  }

  const { fees, fxRates, feeRevenue } = data;
  // Worked example on a $1,000 milestone using the live fees.
  const sample = 1000;
  const clientFee = sample * fees.clientServicePct;
  const freelancerFee = sample * fees.freelancerFeePct;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-wider uppercase">
          <span className="text-muted-foreground">Commerce</span>{' '}
          <span className="text-ink">Fees &amp; FX</span>
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Fees &amp; FX</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure service and freelancer fees, express and FX margins, and manage exchange rates.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Fee schedule */}
        <div className="lg:col-span-2">
          <SectionCard
            label="Fee schedule"
            action={
              canManage ? (
                <button
                  type="button"
                  onClick={() => setFeesOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-field bg-white px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-muted"
                >
                  <Pencil className="size-3.5 text-muted-foreground" /> Edit fees
                </button>
              ) : null
            }
          >
            <div className="divide-y divide-hairline">
              {FEE_ROWS.map((row) => (
                <div key={row.key} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{row.label}</p>
                    <p className="text-xs text-muted-foreground">{row.hint}</p>
                  </div>
                  <span className="text-lg font-bold text-ink tabular-nums">
                    {pct(fees[row.key] as number)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-ink">Minimum withdrawal</p>
                  <p className="text-xs text-muted-foreground">Smallest payout allowed</p>
                </div>
                <span className="text-lg font-bold text-ink tabular-nums">
                  {usd(fees.minWithdrawalUsd)}
                </span>
              </div>
            </div>

            {/* Worked example */}
            <div className="mt-4 rounded-lg border border-hairline bg-muted/40 px-4 py-3">
              <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                Example · {usd(sample)} milestone
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Payer pays</p>
                  <p className="font-semibold text-ink">{usd(sample + clientFee)}</p>
                  <p className="text-xs text-muted-foreground">incl. {usd(clientFee)} fee</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Payee receives</p>
                  <p className="font-semibold text-positive">{usd(sample - freelancerFee)}</p>
                  <p className="text-xs text-muted-foreground">less {usd(freelancerFee)} fee</p>
                </div>
              </div>
            </div>
            {fees.updatedAt ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Last updated {new Date(fees.updatedAt).toLocaleString('en-GB')}
              </p>
            ) : null}
          </SectionCard>
        </div>

        {/* Fee revenue */}
        <div className="lg:col-span-1">
          <SectionCard label="Fees collected">
            {feeRevenue.length === 0 ? (
              <p className="text-sm text-muted-foreground">No fees collected yet.</p>
            ) : (
              <div className="space-y-2">
                {feeRevenue.map((row) => (
                  <div
                    key={`${row.type}-${row.currency}`}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="capitalize text-ink">
                      {row.type.toLowerCase().replace(/_/g, ' ')}
                    </span>
                    <span className="font-semibold text-ink tabular-nums">
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: row.currency,
                      }).format(row.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Exchange rates */}
      <SectionCard label="Exchange rates">
        <p className="mb-3 text-xs text-muted-foreground">
          Indicative USD rates used for FX conversions (mid-market, before the {pct(fees.fxMarginPct)}{' '}
          margin).
        </p>
        <div className="overflow-hidden rounded-lg border border-hairline">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-hairline text-left text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                <th className="px-4 py-2.5">Currency</th>
                <th className="py-2.5">1 unit = USD</th>
                <th className="py-2.5">1 USD =</th>
                {canManage ? <th className="py-2.5 pr-4 text-right">Edit</th> : null}
              </tr>
            </thead>
            <tbody>
              {fxRates.map((rate) => (
                <tr key={rate.currency} className="border-b border-hairline last:border-0">
                  <td className="px-4 py-3">
                    <span className="mr-2">{rate.flag}</span>
                    <span className="font-medium text-ink">{rate.currency}</span>
                    <span className="ml-1 text-xs text-muted-foreground">{rate.label}</span>
                  </td>
                  <td className="py-3 tabular-nums text-ink">
                    ${rate.usdRate.toLocaleString('en-US', { maximumFractionDigits: 6 })}
                  </td>
                  <td className="py-3 tabular-nums text-muted-foreground">
                    {rate.perUsd.toLocaleString('en-US', { maximumFractionDigits: 4 })}{' '}
                    {rate.currency}
                  </td>
                  {canManage ? (
                    <td className="py-3 pr-4 text-right">
                      {rate.currency === 'USD' ? (
                        <span className="text-xs text-muted-foreground">base</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditRate(rate)}
                          className="inline-flex items-center gap-1 font-medium text-brand-600 hover:opacity-80"
                        >
                          <Pencil className="size-3.5" /> Edit
                        </button>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {feesOpen ? <FeesEditModal onClose={() => setFeesOpen(false)} fees={fees} /> : null}
      {editRate ? <FxRateModal rate={editRate} onClose={() => setEditRate(null)} /> : null}
    </div>
  );
}

function FeesEditModal({ onClose, fees }: { onClose: () => void; fees: FeeSchedule }) {
  const update = useUpdateFees();
  const [form, setForm] = useState(() => ({
    clientServicePct: (fees.clientServicePct * 100).toString(),
    freelancerFeePct: (fees.freelancerFeePct * 100).toString(),
    expressWithdrawalPct: (fees.expressWithdrawalPct * 100).toString(),
    fxMarginPct: (fees.fxMarginPct * 100).toString(),
    minWithdrawalUsd: fees.minWithdrawalUsd.toString(),
  }));

  const invalid =
    [form.clientServicePct, form.freelancerFeePct, form.expressWithdrawalPct, form.fxMarginPct, form.minWithdrawalUsd].some(
      (value) => value.trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0,
    );

  async function submit() {
    if (invalid) return;
    try {
      await update.mutateAsync({
        clientServicePct: Number(form.clientServicePct) / 100,
        freelancerFeePct: Number(form.freelancerFeePct) / 100,
        expressWithdrawalPct: Number(form.expressWithdrawalPct) / 100,
        fxMarginPct: Number(form.fxMarginPct) / 100,
        minWithdrawalUsd: Number(form.minWithdrawalUsd),
      });
      toast.success('Fee schedule updated');
      onClose();
    } catch (updateError) {
      toast.error('Could not update fees', { description: normaliseError(updateError).message });
    }
  }

  const FIELDS: { key: keyof typeof form; label: string; suffix: string }[] = [
    { key: 'clientServicePct', label: 'Client service fee', suffix: '%' },
    { key: 'freelancerFeePct', label: 'Freelancer fee', suffix: '%' },
    { key: 'expressWithdrawalPct', label: 'Express withdrawal', suffix: '%' },
    { key: 'fxMarginPct', label: 'FX margin', suffix: '%' },
    { key: 'minWithdrawalUsd', label: 'Minimum withdrawal', suffix: 'USD' },
  ];

  return (
    <Dialog open onOpenChange={(next) => !next && !update.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">Edit fee schedule</DialogTitle>
          <DialogDescription>
            Percentages are of the transaction amount. Changes apply immediately to new
            transactions.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {FIELDS.map((field) => (
            <div key={field.key}>
              <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
              <div className="relative mt-1">
                <input
                  value={form[field.key]}
                  onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                  inputMode="decimal"
                  className="h-10 w-full rounded-lg border border-field bg-white pr-14 pl-3 text-sm text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
                />
                <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
                  {field.suffix}
                </span>
              </div>
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={update.isPending}
              className="rounded-lg border border-field px-4 py-2 text-sm font-medium text-ink transition hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={update.isPending || invalid}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {update.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save fees
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FxRateModal({ rate, onClose }: { rate: FxRate; onClose: () => void }) {
  const update = useUpdateFxRate();
  const [perUsd, setPerUsd] = useState(() => rate.perUsd.toString());

  const value = Number(perUsd);
  const invalid = !Number.isFinite(value) || value <= 0;

  async function submit() {
    if (invalid) return;
    try {
      await update.mutateAsync({ currency: rate.currency, usdRate: 1 / value });
      toast.success(`${rate.currency} rate updated`);
      onClose();
    } catch (updateError) {
      toast.error('Could not update rate', { description: normaliseError(updateError).message });
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !update.isPending && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {rate?.flag} Edit {rate?.currency} rate
          </DialogTitle>
          <DialogDescription>Set how many {rate?.currency} equal 1 US Dollar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">1 USD =</label>
            <div className="relative mt-1">
              <input
                value={perUsd}
                onChange={(event) => setPerUsd(event.target.value)}
                inputMode="decimal"
                className="h-10 w-full rounded-lg border border-field bg-white pr-16 pl-3 text-sm text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
              />
              <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
                {rate?.currency}
              </span>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={update.isPending}
              className="rounded-lg border border-field px-4 py-2 text-sm font-medium text-ink transition hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={update.isPending || invalid}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {update.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save rate
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionCard({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          {label}
        </p>
        {action}
      </div>
      {children}
    </div>
  );
}

function NoAccess({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <Lock className="size-6" />
      </span>
      <p className="text-sm font-semibold text-ink">No access</p>
      <p className="max-w-sm text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
