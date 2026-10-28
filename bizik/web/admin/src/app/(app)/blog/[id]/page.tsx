'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Lock } from 'lucide-react';

import { normaliseError } from '@/lib/api/client';
import { usePermission } from '@/lib/auth/permissions';
import { useBlogPost } from '@/features/blog/hooks';
import { BlogForm } from '@/features/blog/blog-form';

export default function EditBlogPostPage() {
  const { id } = useParams<{ id: string }>();
  const canView = usePermission('support.view');
  const canManage = usePermission('support.manage');
  const { data: post, isLoading, isError, error } = useBlogPost(canView ? id : null);

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-24 text-center">
        <span className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <Lock className="size-6" />
        </span>
        <p className="text-sm font-semibold text-ink">No access</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          You don’t have permission to view blog content.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !post) {
    return (
      <div className="space-y-4">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:opacity-80"
        >
          <ArrowLeft className="size-4" /> Blog
        </Link>
        <div className="rounded-lg border border-hairline bg-surface p-6 text-sm text-destructive">
          {isError ? normaliseError(error).message : 'Post not found.'}
        </div>
      </div>
    );
  }

  return <BlogForm post={post} canManage={canManage} />;
}
