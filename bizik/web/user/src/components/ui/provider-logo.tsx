import { cn } from '@/lib/utils';

/** True when a payout `type` is a mobile-money provider (MTN / Orange). */
export function isMomoType(type: string) {
  return type === 'MTN_MOMO' || type === 'ORANGE_MONEY';
}

interface ProviderLogoProps {
  /** Backend payout `type` - 'MTN_MOMO' | 'ORANGE_MONEY'. */
  type: string;
  /** Tile edge length in pixels (defaults to a compact 40). */
  size?: number;
  className?: string;
}

/**
 * Brand tile for mobile-money providers: a rounded, brand-coloured square
 * carrying the provider wordmark. A styled <span> only - no image assets - so
 * it mirrors the mobile `ProviderLogo` exactly.
 */
export function ProviderLogo({ type, size = 40, className }: ProviderLogoProps) {
  const isOrange = type === 'ORANGE_MONEY';
  const wordmark = isOrange ? 'orange' : 'MTN';

  return (
    <span
      className={cn('flex shrink-0 items-center justify-center font-black leading-none', className)}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        backgroundColor: isOrange ? '#FF7900' : '#FFCC00',
        color: isOrange ? '#FFFFFF' : '#000000',
        // Orange's wordmark carries more glyphs, so it needs a smaller face.
        fontSize: isOrange ? size * 0.26 : size * 0.34,
        letterSpacing: isOrange ? 0 : '0.02em',
      }}
    >
      {wordmark}
    </span>
  );
}
