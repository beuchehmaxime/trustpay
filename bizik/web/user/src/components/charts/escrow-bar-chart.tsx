/**
 * Escrow-flow bar chart - funded vs released per period. Lightweight inline SVG
 * (no chart lib yet); keeps the handoff's bar shape + palette. Swap for the
 * codebase's charting library when one is added.
 */
export function EscrowBarChart({
  data,
  className,
}: {
  data: { label: string; funded: number; released: number }[];
  className?: string;
}) {
  const width = 520;
  const height = 180;
  const padX = 8;
  const padTop = 12;
  const padBottom = 26;
  const chartH = height - padTop - padBottom;
  const max = Math.max(...data.flatMap((d) => [d.funded, d.released]), 1);
  const groupW = (width - padX * 2) / data.length;
  const barW = Math.min(16, groupW / 3);

  const y = (value: number) => padTop + chartH - (value / max) * chartH;

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label="Escrow held versus released per month"
      >
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={padX}
            x2={width - padX}
            y1={padTop + chartH * (1 - t)}
            y2={padTop + chartH * (1 - t)}
            stroke="#F1F5FA"
            strokeWidth={1}
          />
        ))}
        {data.map((d, index) => {
          const cx = padX + groupW * index + groupW / 2;
          return (
            <g key={d.label}>
              <rect
                x={cx - barW - 2}
                y={y(d.funded)}
                width={barW}
                height={padTop + chartH - y(d.funded)}
                rx={4}
                fill="#3B82F6"
              />
              <rect
                x={cx + 2}
                y={y(d.released)}
                width={barW}
                height={padTop + chartH - y(d.released)}
                rx={4}
                fill="#22B8D9"
              />
              <text
                x={cx}
                y={height - 8}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize={11}
                fontWeight={500}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex items-center gap-4 text-[11px] font-medium text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-brand-500" /> Held in escrow
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-cyan-500" /> Released
        </span>
      </div>
    </div>
  );
}
