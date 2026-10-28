import Image from 'next/image';
import Link from 'next/link';

import { cn } from '@/lib/utils';

/**
 * The Bizik brand lockup.
 *
 * Two artwork files, not one: the landscape lockup already contains the
 * wordmark, so `iconOnly` swaps to the mark on its own rather than cropping.
 *
 * The wordmark in the landscape file is near-white and only reads on a dark
 * ground, so `onDark` chooses between it and the icon-plus-text arrangement
 * that works on a light one.
 */
export function Logo({
  href = '/',
  iconOnly = false,
  onDark = false,
  className,
}: {
  href?: string;
  iconOnly?: boolean;
  onDark?: boolean;
  className?: string;
}) {
  if (iconOnly) {
    return (
      <Link href={href} className={cn('flex items-center', className)} aria-label="Bizik home">
        <Image src="/brand/logo-icon.png" alt="Bizik" width={36} height={36} priority
          className="h-9 w-auto" />
      </Link>
    );
  }

  if (onDark) {
    return (
      <Link href={href} className={cn('flex items-center', className)} aria-label="Bizik home">
        <Image src="/brand/logo-landscape.png" alt="Bizik" width={4647} height={1491} priority
          className="h-8 w-auto" />
      </Link>
    );
  }

  // Light ground: the mark carries the colour and the wordmark is set in type,
  // because the supplied lockup's near-white wordmark would disappear here.
  return (
    <Link href={href} className={cn('flex items-center gap-2.5', className)} aria-label="Bizik home">
      <Image src="/brand/logo-icon.png" alt="" width={36} height={36} priority
        className="h-8 w-auto" />
      <span className="text-lg font-bold tracking-tight text-ink">Bizik</span>
    </Link>
  );
}
