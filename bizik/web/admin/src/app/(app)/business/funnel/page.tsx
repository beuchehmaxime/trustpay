'use client';

import { ArrowDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useProductAnalytics } from '@/features/analytics/business.hooks';
import { RequirePermission } from '@/features/analytics/guard';
import { useRange } from '@/features/analytics/range';
import type { FunnelStage } from '@/features/analytics/business.types';
import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Failed,
  Loading,
  Note,
  Stat,
  StatRow,
} from '@/features/analytics/ui';

/**
 * Funnel: every step between arriving and money moving.
 *
 * Drawn as stages with the loss called out between them, rather than as a list
 * of counts. The counts are not the finding - a stage that keeps 96% and one
 * that keeps 4% look identical as two numbers in a column, and completely
 * different as two bars with the drop written between them.
 */
export default function FunnelPage() {
  return (
    <RequirePermission permission="analytics.product" what="The funnel">
      <FunnelContent />
    </RequirePermission>
  );
}

function FunnelContent() {
  const { days } = useRange();
  const query = useProductAnalytics(days);

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <Failed what="the funnel" />;

  const { funnel, conversion } = query.data;
  const stages = funnel.stages;
  const top = stages[0]?.count ?? 0;
  const bottom = stages[stages.length - 1]?.count ?? 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Top and bottom"
          description="What the whole funnel is worth end to end, before looking at where it leaks."
        />
        <CardBody>
          <StatRow columns={4}>
            <Stat label="Reached the top" value={top} hint={stages[0]?.label} size="lg" />
            <Stat
              label="Reached the bottom"
              value={bottom}
              hint={stages[stages.length - 1]?.label}
              size="lg"
            />
            <Stat
              label="End to end"
              value={top > 0 ? `${((bottom / top) * 100).toFixed(1)}%` : null}
              hint="Of everyone who started"
              size="lg"
              tone={top > 0 && bottom / top < 0.05 ? 'negative' : 'neutral'}
            />
            <Stat
              label={`Visitor to account, ${days}d`}
              value={conversion.rate === null ? null : `${(conversion.rate * 100).toFixed(1)}%`}
              hint={`${conversion.signedUp} of ${conversion.visitors} visitors`}
              size="lg"
            />
          </StatRow>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Where people stop"
          description="Each stage has to happen before the business earns anything. Counted over all accounts, not the selected window, because a funnel over seven days of a young product is mostly noise."
        />
        <CardBody className="space-y-5">
          {funnel.biggestDropOff ? (
            <Callout tone="warning">
              The largest loss is between <strong>{funnel.biggestDropOff.from}</strong> and{' '}
              <strong>{funnel.biggestDropOff.to}</strong>: {funnel.biggestDropOff.lost} people.
              Nothing further down can improve until that does.
            </Callout>
          ) : null}

          <ol className="space-y-1">
            {stages.map((stage, index) => (
              <li key={stage.key}>
                <Stage stage={stage} rank={index} />
                {index < stages.length - 1 && stage.count > 0 ? (
                  <Drop lost={stages[index + 1].droppedFromPrevious} />
                ) : null}
              </li>
            ))}
          </ol>

          <Note>
            With few accounts the totals say little and the drop-off says almost everything. A stage
            keeping under half of the one above it is marked in red.
          </Note>
        </CardBody>
      </Card>
    </div>
  );
}

function Stage({ stage, rank }: { stage: FunnelStage; rank: number }) {
  // A stage losing more than half of the previous one is the thing to look at
  // first, so it is coloured rather than left to be worked out from the numbers.
  const severe = stage.conversionFromPrevious !== null && stage.conversionFromPrevious < 0.5;
  const width = Math.max(1.5, stage.shareOfTop * 100);

  return (
    <div className="rounded-lg px-3 py-3 transition hover:bg-muted/40">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="flex items-baseline gap-2.5">
          <span className="text-[11px] font-semibold tabular-nums text-subtle">{rank + 1}</span>
          <span className="text-[14px] font-medium text-ink">{stage.label}</span>
        </span>
        <span className="flex items-baseline gap-3">
          {stage.conversionFromPrevious !== null ? (
            <span
              className={cn(
                'text-[12.5px] font-semibold tabular-nums',
                severe ? 'text-negative' : 'text-muted-foreground',
              )}
            >
              {(stage.conversionFromPrevious * 100).toFixed(0)}% of previous
            </span>
          ) : null}
          <span className="text-[17px] font-bold tabular-nums text-ink">
            {stage.count.toLocaleString('en-US')}
          </span>
        </span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            severe ? 'bg-negative' : 'bg-brand-500',
          )}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function Drop({ lost }: { lost: number }) {
  if (lost <= 0) return null;
  return (
    <div className="flex items-center gap-1.5 pl-3 text-[12px] text-muted-foreground">
      <ArrowDown className="size-3.5 text-negative/70" />
      <span>
        <strong className="font-semibold text-negative">{lost.toLocaleString('en-US')}</strong> lost
        here
      </span>
    </div>
  );
}
