import { ShieldCheck, BadgeCheck, Clock, Scale } from 'lucide-react';

/** Archimedean spiral path (radius grows with the angle) for the decorative backdrop. */
function spiralPath(turns = 8, spacing = 36, centerX = 200, centerY = 200, steps = 780) {
  const totalAngle = turns * 2 * Math.PI;
  let path = '';
  for (let step = 0; step <= steps; step++) {
    const angle = (step / steps) * totalAngle;
    const radius = (spacing * angle) / (2 * Math.PI);
    const pointX = centerX + radius * Math.cos(angle);
    const pointY = centerY + radius * Math.sin(angle);
    path += `${step === 0 ? 'M' : 'L'}${pointX.toFixed(1)} ${pointY.toFixed(1)} `;
  }
  return path.trim();
}

const SPIRAL = spiralPath();

/**
 * Admin console auth panel: an authoritative brand-to-ink gradient layered with
 * spiral line-work and a mock review-queue card. Deliberately more serious than
 * the consumer app panel.
 */
export function AdminBrandPanel() {
  return (
    <div className="relative hidden flex-col justify-between overflow-hidden bg-linear-to-br from-brand-800 via-brand-900 to-ink p-10 lg:flex xl:p-12">
      {/* Spiral line-work - anchored to the top-left, fading out toward the bottom */}
      <div className="pointer-events-none absolute -top-48 -left-48 size-[780px] blur-[1.4px]">
        <svg viewBox="0 0 400 400" fill="none" aria-hidden className="size-full">
          <defs>
            <linearGradient id="spiralFade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.30" />
              <stop offset="55%" stopColor="#ffffff" stopOpacity="0.11" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={SPIRAL}
            stroke="url(#spiralFade)"
            strokeWidth={1.1}
            strokeLinecap="round"
          />
          <path
            d={SPIRAL}
            transform="rotate(42 200 200)"
            stroke="url(#spiralFade)"
            strokeWidth={0.7}
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Soft light blooms */}
      <div className="pointer-events-none absolute -top-20 -right-16 size-72 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-12 size-80 rounded-full bg-brand-400/20 blur-3xl" />

      <div className="relative z-10 flex w-fit items-center gap-2 text-white">
        <span className="flex size-9 items-center justify-center rounded-lg bg-white/15 text-base font-bold">
          Q
        </span>
        <span className="text-lg font-bold">
          BiZik <span className="font-medium text-white/70">Admin</span>
        </span>
      </div>

      <div className="relative z-10 max-w-md text-white">
        <h2 className="text-3xl font-extrabold leading-tight">Compliance & operations.</h2>
        <p className="mt-3 text-white/75">
          Review verifications, resolve disputes and keep the BiZik platform safe
          and compliant.
        </p>
        <div className="mt-6 flex items-center gap-2 text-sm text-white/70">
          <Clock className="size-4" />
          Access restricted to authorised staff
        </div>
      </div>

      {/* Review-queue card */}
      <div className="relative z-10 mx-auto w-full">
        <div className="rounded-3xl bg-white p-5 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">KYC review queue</p>
              <p className="mt-0.5 text-3xl font-extrabold text-ink">12 pending</p>
            </div>
            <span className="flex size-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <ShieldCheck className="size-5" />
            </span>
          </div>
          <div className="mt-4 space-y-2">
            <QueueRow name="A. Okafor" tag="Pending" tone="warning" />
            <QueueRow name="M. Diallo" tag="Approved" tone="positive" />
            <QueueRow name="S. Mensah" tag="Review" tone="brand" />
          </div>
        </div>

        <div className="absolute -top-5 -right-4 flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 shadow-xl ring-1 ring-white/10">
          <BadgeCheck className="size-4 text-positive" />
          <p className="text-sm font-bold text-white">Verified</p>
        </div>
        <div className="absolute -bottom-5 -left-5 flex items-center gap-2.5 rounded-lg bg-white px-4 py-2.5 shadow-xl">
          <span className="flex size-8 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Scale className="size-4" />
          </span>
          <div>
            <p className="text-[11px] font-semibold text-ink">Dispute resolved</p>
            <p className="text-[10px] text-muted-foreground">2 min ago</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function QueueRow({
  name,
  tag,
  tone,
}: {
  name: string;
  tag: string;
  tone: 'warning' | 'positive' | 'brand';
}) {
  const tones = {
    warning: 'bg-warning/10 text-warning',
    positive: 'bg-positive-bg text-positive',
    brand: 'bg-brand-50 text-brand-700',
  } as const;
  return (
    <div className="flex items-center justify-between rounded-lg border border-hairline px-3.5 py-2.5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-bold text-ink">
          {name.charAt(0)}
        </span>
        <span className="text-sm font-medium text-ink">{name}</span>
      </div>
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>
        {tag}
      </span>
    </div>
  );
}
