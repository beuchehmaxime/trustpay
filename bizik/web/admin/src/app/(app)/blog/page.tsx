'use client';

import Link from 'next/link';
import { ArrowRight, Loader2, Lock, Newspaper, Plus } from 'lucide-react';

import { normaliseError } from '@/lib/api/client';
import { usePermission } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useBlogPosts } from '@/features/blog/hooks';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function BlogPage() {
  const canView = usePermission('support.view');
  const canManage = usePermission('support.manage');
  const { data, isLoading, isError, error } = useBlogPosts(canView);
  const posts = data ?? [];

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wider uppercase">
            <span className="text-muted-foreground">Access &amp; settings</span>{' '}
            <span className="text-ink">Blog</span>
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Blog</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Author and publish articles for the public blog.
          </p>
        </div>
        {canManage ? (
          <Link
            href="/blog/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
          >
            <Plus className="size-4" /> New post
          </Link>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        {isError ? (
          <div className="p-6 text-sm text-destructive">{normaliseError(error).message}</div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <Newspaper className="size-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">No posts yet.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <HeaderCell>Title</HeaderCell>
                <HeaderCell>Category</HeaderCell>
                <HeaderCell>Status</HeaderCell>
                <HeaderCell>Updated</HeaderCell>
                <HeaderCell className="text-right">Edit</HeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.map((post) => (
                <TableRow key={post.id} className="hover:bg-muted/40">
                  <TableCell className="py-4">
                    <div className="font-semibold text-ink">{post.title}</div>
                    <div className="text-xs text-muted-foreground">/{post.slug}</div>
                  </TableCell>
                  <TableCell className="text-ink">{post.categoryLabel}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        post.published
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-600',
                      )}
                    >
                      {post.published ? 'Published' : 'Draft'}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(post.updatedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/blog/${post.id}`}
                      className="inline-flex items-center gap-1 font-medium text-brand-600 hover:opacity-80"
                    >
                      Edit <ArrowRight className="size-3.5" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function HeaderCell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <TableHead
      className={cn(
        'text-[11px] font-semibold tracking-wider text-muted-foreground uppercase',
        className,
      )}
    >
      {children}
    </TableHead>
  );
}
