'use client';

import { cn } from '@/lib/utils';
import { xafShort } from './ui';

/**
 * Charts, drawn by hand in SVG.
 *
 * No charting library. The console already ships four JavaScript bundles to
 * operators on Cameroonian mobile connections, and a 150kB dependency to draw
 * two line charts and some bars is not a trade worth making. These are a few
 * hundred bytes and render identically.
 *
 * Every series carries a `<title>`, so hovering any point or bar gives the exact
 * figure. A chart is for the shape; the number still has to be readable.
 */

export interface SeriesPoint {
  label: string;
  value: number;
}

/* ------------------------------------------------------------- area / line */

/**
 * One series over time.
 *
 * Gridlines and a maximum label are drawn because an area chart without a scale
 * can only say "it went up", which is rarely the question being asked.
 */
export function AreaChart({
  points,
  format = (value: number) => value.toLocaleString('en-US'),
  height = 180,
}: {
  points: SeriesPoint[];
  format?: (value: number) => string;
  height?: number;
}) {
  if (points.length === 0) {
    return <ChartEmpty height={height} />;
  }

  const width = 600;
  const plotHeight = 100;
  const max = Math.max(...points.map((point) => point.value), 1);
  const step = points.length > 1 ? width / (points.length - 1) : width;

  const coords = points.map((point, index) => ({
    x: index * step,
    y: plotHeight - (point.value / max) * (plotHeight - 6) - 3,
  }));

  const line = coords
    .map((coord, index) => `${index === 0 ? 'M' : 'L'}${coord.x.toFixed(2)},${coord.y.toFixed(2)}`)
    .join(' ');
  const area = `${line} L${width},${plotHeight} L0,${plotHeight} Z`;

  // Only a handful of ticks, however many points there are: a 90 day range with
  // one label per day is a grey smear, not an axis.
  const tickEvery = Math.max(1, Math.ceil(points.length / 7));

  return (
    <div>
      <div className="relative" style={{ height }}>
        {/* Gridlines sit behind the plot and carry the scale. */}
        <div className="absolute inset-0 flex flex-col justify-between">
          {[1, 0.5, 0].map((fraction) => (
            <div key={fraction} className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-right text-[10px] tabular-nums text-subtle">
                {format(max * fraction)}
              </span>
              <span className="h-px flex-1 bg-hairline" />
            </div>
          ))}
        </div>

        <div className="absolute inset-0 pl-12">
          <svg
            viewBox={`0 0 ${width} ${plotHeight}`}
            preserveAspectRatio="none"
            className="h-full w-full overflow-visible"
            role="img"
          >
            <defs>
              <linearGradient id="analytics-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#analytics-area)" />
            <path
              d={line}
              fill="none"
              stroke="var(--color-brand-600)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {/* Invisible wide columns make every point hoverable, which a 2px
                line is not. */}
            {points.map((point, index) => (
              <rect
                key={point.label}
                x={Math.max(0, coords[index].x - step / 2)}
                y={0}
                width={step}
                height={plotHeight}
                fill="transparent"
              >
                <title>{`${point.label}: ${format(point.value)}`}</title>
              </rect>
            ))}
          </svg>
        </div>
      </div>

      <div className="mt-2 flex justify-between pl-12">
        {points.map((point, index) =>
          index % tickEvery === 0 || index === points.length - 1 ? (
            <span key={point.label} className="text-[10px] text-subtle">
              {point.label}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- paired columns */

/**
 * Two series side by side per period, for revenue against cost.
 *
 * Paired columns rather than a stacked bar: stacking implies the two add up to
 * something meaningful, and revenue plus costs does not.
 */
export function PairedBarChart({
  periods,
  height = 200,
}: {
  periods: { label: string; primary: number; secondary: number }[];
  height?: number;
}) {
  if (periods.length === 0) return <ChartEmpty height={height} />;

  const peak = Math.max(
    1,
    ...periods.map((period) => Math.max(period.primary, period.secondary)),
  );
  const everythingIsZero = periods.every(
    (period) => period.primary === 0 && period.secondary === 0,
  );

  return (
    <div>
      <div className="flex gap-2" style={{ height }}>
        <div className="flex w-10 shrink-0 flex-col justify-between py-0.5 text-right">
          {[1, 0.5, 0].map((fraction) => (
            <span key={fraction} className="text-[10px] tabular-nums text-subtle">
              {xafShort(peak * fraction)}
            </span>
          ))}
        </div>
        <div className="relative flex flex-1 items-end gap-1.5 border-b border-hairline">
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            {[0, 1].map((line) => (
              <span key={line} className="h-px w-full bg-hairline" />
            ))}
          </div>
          {/* `h-full` is load-bearing. The parent is `items-end`, so without it
              each period wrapper shrinks to its content height, and a column
              asking for 60% of an auto-height parent resolves to zero - the
              chart draws its axis, its gridlines and its legend, and no bars. */}
          {periods.map((period) => (
            <div
              key={period.label}
              className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5"
            >
              <Column
                heightPct={(period.primary / peak) * 100}
                className="bg-brand-500"
                title={`${period.label} revenue ${xafShort(period.primary)}`}
              />
              <Column
                heightPct={(period.secondary / peak) * 100}
                className="bg-rose-400"
                title={`${period.label} costs ${xafShort(period.secondary)}`}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex gap-2">
        <span className="w-10 shrink-0" />
        <div className="flex flex-1 gap-1.5">
          {periods.map((period) => (
            <span
              key={period.label}
              className="flex-1 text-center text-[10px] tabular-nums text-subtle"
            >
              {period.label.slice(5)}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-5">
        <Legend className="bg-brand-500" label="Revenue" />
        <Legend className="bg-rose-400" label="Operating costs" />
        {everythingIsZero ? (
          <span className="text-[12px] text-muted-foreground">
            Nothing to plot yet - no revenue and no costs recorded in any of these months.
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Column({
  heightPct,
  className,
  title,
}: {
  heightPct: number;
  className: string;
  title: string;
}) {
  return (
    <div
      // A zero column still gets a hairline of height, so the period reads as
      // "measured and zero" rather than "missing".
      style={{ height: `${Math.max(heightPct, 0.8)}%` }}
      className={cn('w-full max-w-3.5 rounded-t-sm transition-all', className)}
      title={title}
    />
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <span className={cn('size-2.5 rounded-sm', className)} />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------- ranked bars */

/** A horizontal ranked list, for traffic sources and anything else top-N. */
export function RankedBars({
  rows,
}: {
  rows: { label: string; value: number }[];
}) {
  const peak = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[13px] font-medium text-ink">{row.label}</span>
            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink">
              {row.value.toLocaleString('en-US')}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${Math.max(2, (row.value / peak) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ChartEmpty({ height }: { height: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg border border-dashed border-hairline text-[12.5px] text-muted-foreground"
      style={{ height }}
    >
      Nothing recorded for this period yet.
    </div>
  );
}
