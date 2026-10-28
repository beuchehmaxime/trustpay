/** Handoff chart palette. */
const PALETTE = ['#3B82F6', '#22B8D9', '#16A34A', '#F59E0B', '#6366F1', '#E11D48'];

/**
 * "Escrow by deal" donut with a legend showing each slice's share. Lightweight
 * inline SVG (no chart lib yet) - keeps the handoff donut shape + palette.
 */
export function DonutChart({
  data,
  className,
}: {
  data: { label: string; value: number }[];
  className?: string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
  const radius = 52;
  const stroke = 16;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className={className}>
      <div className="flex items-center gap-5">
        <svg viewBox="0 0 140 140" className="size-28 shrink-0 -rotate-90">
          <circle cx={70} cy={70} r={radius} fill="none" stroke="#F1F5FA" strokeWidth={stroke} />
          {data.map((d, index) => {
            const fraction = d.value / total;
            const dash = fraction * circumference;
            const seg = (
              <circle
                key={d.label}
                cx={70}
                cy={70}
                r={radius}
                fill="none"
                stroke={PALETTE[index % PALETTE.length]}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += dash;
            return seg;
          })}
        </svg>

        <ul className="min-w-0 flex-1 space-y-1.5">
          {data.map((d, index) => (
            <li key={d.label} className="flex items-center gap-2 text-[13px]">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: PALETTE[index % PALETTE.length] }}
              />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.label}</span>
              <span className="font-bold text-ink">{Math.round((d.value / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
