/**
 * Shared semantic tones for status badges across every admin section, so the
 * whole console uses one consistent (slightly saturated, not washed-out) look.
 * Backgrounds sit at the ~100 level with ~700/800 text for strong contrast.
 */
export type StatusTone = 'positive' | 'negative' | 'warning' | 'info' | 'neutral' | 'purple';

export const STATUS_TONE: Record<StatusTone, string> = {
  positive: 'bg-emerald-100 text-emerald-800',
  negative: 'bg-rose-100 text-rose-800',
  warning: 'bg-amber-100 text-amber-800',
  info: 'bg-blue-100 text-blue-800',
  neutral: 'bg-slate-100 text-slate-700',
  purple: 'bg-violet-100 text-violet-800',
};

/** Resolve a tone to its badge classes (defaults to neutral). */
export function toneClass(tone: StatusTone | undefined): string {
  return STATUS_TONE[tone ?? 'neutral'];
}
