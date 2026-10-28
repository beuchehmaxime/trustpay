'use client';

import { Lock } from 'lucide-react';

import { usePermission } from '@/lib/auth/permissions';
import { BlogForm } from '@/features/blog/blog-form';

export default function NewBlogPostPage() {
  const canView = usePermission('support.view');
  const canManage = usePermission('support.manage');

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

  return <BlogForm post={null} canManage={canManage} />;
}
