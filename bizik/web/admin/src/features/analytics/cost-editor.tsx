'use client';

import { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { normaliseError } from '@/lib/api/client';
import { useDeleteCost, useOperatingCosts, useSaveCost } from './business.hooks';
import { COST_CATEGORIES, type CostCategory, type OperatingCost } from './business.types';
import { Card, CardBody, CardHeader, Empty, Note, Table, Td, xaf } from './ui';

/**
 * What the business spends, by month.
 *
 * Entered by hand because nothing in the platform knows what a server, a salary
 * or a lawyer costs. Without it EBITDA cannot be calculated at all - and the
 * tempting alternative, treating missing costs as zero, would report revenue as
 * profit and show a company losing money as comfortably profitable. That is the
 * most dangerous number a dashboard can display, so the figure stays absent
 * until somebody says what the month cost.
 *
 * Read and write are separate permissions. Reading the P&L is not a reason to be
 * able to change what it is built from, and a cost edit moves the profit figure
 * the business is run on - so every change is audited.
 */
const CATEGORY_LABEL: Record<CostCategory, string> = {
  INFRASTRUCTURE: 'Infrastructure (servers, domains)',
  SALARIES: 'Salaries and contractors',
  PAYMENT_PROVIDER: 'Payment provider fees',
  MARKETING: 'Marketing',
  LEGAL_COMPLIANCE: 'Legal and compliance',
  OTHER: 'Other',
};

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function CostEditor({ canEdit }: { canEdit: boolean }) {
  const costs = useOperatingCosts();
  const saveCost = useSaveCost();
  const deleteCost = useDeleteCost();

  const [month, setMonth] = useState(thisMonth());
  const [category, setCategory] = useState<CostCategory>('INFRASTRUCTURE');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  function submit() {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error('Enter the amount in FCFA.');
      return;
    }
    saveCost.mutate(
      { month, category, amountXaf: parsed, note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(`${CATEGORY_LABEL[category]} saved for ${month}`);
          setAmount('');
          setNote('');
        },
        onError: (error) => toast.error(normaliseError(error).message),
      },
    );
  }

  // Newest month first: the one being worked on is almost always the current one.
  const byMonth = new Map<string, OperatingCost[]>();
  for (const cost of costs.data ?? []) {
    const existing = byMonth.get(cost.month) ?? [];
    existing.push(cost);
    byMonth.set(cost.month, existing);
  }
  const months = [...byMonth.entries()].sort((left, right) => right[0].localeCompare(left[0]));

  return (
    <div className="space-y-6">
      {canEdit ? (
        <Card>
          <CardHeader
            title="Add or replace a figure"
            description="Saving the same month and category again replaces what is there. Every change is recorded in the audit log."
          />
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Month">
                <input
                  type="month"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Category">
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as CostCategory)}
                  className={inputClass}
                >
                  {COST_CATEGORIES.map((option) => (
                    <option key={option} value={option}>
                      {CATEGORY_LABEL[option]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Amount in FCFA">
                <input
                  inputMode="numeric"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ''))}
                  placeholder="150000"
                  className={inputClass}
                />
              </Field>
              <Field label="Note (optional)">
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Hetzner, October"
                  className={inputClass}
                />
              </Field>
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={saveCost.isPending || !amount}
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-[13.5px] font-semibold text-white transition hover:opacity-95 disabled:opacity-50"
            >
              {saveCost.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Save cost
            </button>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody>
            <Note>
              You can read these figures. Changing them needs the{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-[12px]">analytics.costs</code>{' '}
              permission.
            </Note>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Recorded costs" description="Most recent month first." />
        <CardBody className="p-0">
          {costs.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : months.length === 0 ? (
            <Empty>
              No costs entered yet, so EBITDA cannot be calculated for any month.
            </Empty>
          ) : (
            months.map(([entryMonth, entries]) => {
              const total = entries.reduce((sum, cost) => sum + cost.amountXaf, 0);
              return (
                <div key={entryMonth} className="border-b border-hairline last:border-0">
                  <div className="flex items-baseline justify-between bg-muted/40 px-6 py-2.5">
                    <h3 className="text-[12px] font-semibold tracking-wider text-muted-foreground uppercase">
                      {entryMonth}
                    </h3>
                    <span className="text-[13.5px] font-bold tabular-nums text-ink">
                      {xaf(total)}
                    </span>
                  </div>
                  <Table>
                    <tbody>
                      {entries.map((cost) => (
                        <tr key={cost.id}>
                          <Td className="pl-6">
                            {CATEGORY_LABEL[cost.category]}
                            {cost.note ? (
                              <span className="ml-2 text-[12px] text-muted-foreground">
                                {cost.note}
                              </span>
                            ) : null}
                          </Td>
                          <Td align="right" className={canEdit ? undefined : 'pr-6'}>
                            {xaf(cost.amountXaf)}
                          </Td>
                          {canEdit ? (
                            <Td align="right" className="w-12 pr-6">
                              <button
                                type="button"
                                onClick={() =>
                                  deleteCost.mutate(cost.id, {
                                    onSuccess: () => toast.success('Removed'),
                                    onError: (error) =>
                                      toast.error(normaliseError(error).message),
                                  })
                                }
                                aria-label={`Remove ${CATEGORY_LABEL[cost.category]} for ${cost.month}`}
                                className="text-muted-foreground transition hover:text-negative"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </Td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              );
            })
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12px] font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'mt-1.5 h-10 w-full rounded-lg border border-field bg-white px-3 text-[13.5px] text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10';
