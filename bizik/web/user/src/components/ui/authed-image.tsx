'use client';

import { useEffect, useState } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';

import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';

/**
 * An evidence photo, which may live behind authentication.
 *
 * Files land in one of two places. With Cloudinary configured they get a
 * public URL and a plain `<img>` works. Without it they are stored locally and
 * served from `/api/v1/file/:id`, which requires a bearer token - and an
 * `<img src>` cannot send one. The result is a 401 and a broken-image icon,
 * which is exactly what a dispute page should never show: the photograph IS
 * the evidence.
 *
 * So: absolute URLs render directly, and anything else is fetched through the
 * api client (which attaches the token and refreshes it) and turned into an
 * object URL that is revoked on unmount.
 *
 * The admin console has its own version of this that takes a file id. This one
 * takes whatever `src` the API returned, because the user-facing endpoints
 * hand back URLs rather than ids.
 */
export function AuthedImage({
  src,
  alt,
  className,
  onReady,
}: {
  src: string;
  alt: string;
  className?: string;
  onReady?: (objectUrl: string) => void;
}) {
  const [resolved, setResolved] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    setResolved(null);
    setFailed(false);

    // Already public, or already a data/blob URL from a local preview.
    if (/^(https?:|data:|blob:)/.test(src)) {
      setResolved(src);
      onReady?.(src);
      return;
    }

    // The api client's baseURL already ends in /api/v1, so that prefix has to
    // come off or the request lands on /api/v1/api/v1/file/...
    const path = src.replace(/^\/?api\/v1/, '');

    api
      .get(path, { responseType: 'blob' })
      .then((response) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(response.data as Blob);
        setResolved(createdUrl);
        onReady?.(createdUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
    // onReady is intentionally excluded - callers pass inline handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  if (failed) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-1 bg-muted text-muted-foreground',
          className,
        )}
        title={alt}
      >
        <ImageOff className="size-5" />
      </div>
    );
  }

  if (!resolved) {
    return (
      <div
        className={cn('flex items-center justify-center bg-muted text-muted-foreground', className)}
      >
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={resolved} alt={alt} className={className} />;
}
