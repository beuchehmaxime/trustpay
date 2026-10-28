'use client';

import { useEffect, useState } from 'react';
import { Loader2, ImageOff } from 'lucide-react';

import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';

/**
 * Renders an image that lives behind the authenticated file proxy
 * (`/api/v1/file/:id`). A plain `<img src>` can't send the bearer token, and
 * sensitive documents (KYC IDs, selfies) are never exposed on public URLs - so
 * we fetch the bytes through the api client (which attaches auth + refreshes
 * tokens), turn them into an object URL, and revoke it on unmount.
 */
export function AuthedImage({
  fileId,
  alt,
  className,
  onReady,
}: {
  fileId: string;
  alt: string;
  className?: string;
  onReady?: (objectUrl: string) => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked = false;
    let createdUrl: string | null = null;
    setObjectUrl(null);
    setFailed(false);

    api
      .get(`/file/${fileId}`, { responseType: 'blob', silent: true })
      .then((response) => {
        if (revoked) return;
        createdUrl = URL.createObjectURL(response.data as Blob);
        setObjectUrl(createdUrl);
        onReady?.(createdUrl);
      })
      .catch(() => {
        if (!revoked) setFailed(true);
      });

    return () => {
      revoked = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
    // onReady is intentionally excluded - callers pass inline handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  if (failed) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-1.5 bg-muted/60 text-muted-foreground',
          className,
        )}
      >
        <ImageOff className="size-6" />
        <span className="text-xs">Could not load image</span>
      </div>
    );
  }

  if (!objectUrl) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-muted/60 text-muted-foreground',
          className,
        )}
      >
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={objectUrl} alt={alt} className={className} />;
}
