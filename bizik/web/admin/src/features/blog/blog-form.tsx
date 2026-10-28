'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Check, Loader2, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { normaliseError } from '@/lib/api/client';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useBlogActions } from './hooks';
import { BLOG_CATEGORIES, type BlogPost, type BlogPostInput } from './types';

const FIELD_CLASS =
  'h-10 w-full rounded-lg border border-field bg-white px-3 text-sm text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 disabled:bg-muted/50';
const AREA_CLASS =
  'w-full resize-y rounded-lg border border-field bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-muted-foreground/70 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 disabled:bg-muted/50';
const LABEL_CLASS = 'text-xs font-semibold tracking-wide text-muted-foreground uppercase';

/** Create + edit form for a blog post. `post === null` means "new". */
export function BlogForm({ post, canManage }: { post: BlogPost | null; canManage: boolean }) {
  const router = useRouter();
  const { create, update, remove } = useBlogActions();

  const [title, setTitle] = useState(post?.title ?? '');
  const [slug, setSlug] = useState(post?.slug ?? '');
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? '');
  const [body, setBody] = useState(post?.body ?? '');
  const [category, setCategory] = useState(post?.category ?? 'guides');
  const [categoryLabel, setCategoryLabel] = useState(post?.categoryLabel ?? 'Guides');
  const [coverImage, setCoverImage] = useState(post?.coverImage ?? '');
  const [author, setAuthor] = useState(post?.author ?? '');
  const [readMinutes, setReadMinutes] = useState<string>(String(post?.readMinutes ?? 4));
  const [seoTitle, setSeoTitle] = useState(post?.seoTitle ?? '');
  const [seoDescription, setSeoDescription] = useState(post?.seoDescription ?? '');
  const [lang, setLang] = useState<'en' | 'fr'>(post?.lang === 'fr' ? 'fr' : 'en');
  const [translationKey, setTranslationKey] = useState(post?.translationKey ?? '');
  const [published, setPublished] = useState(post?.published ?? false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const readOnly = !canManage;
  const canSave =
    title.trim().length > 0 && excerpt.trim().length > 0 && body.trim().length > 0;
  const pending = create.isPending || update.isPending;

  /** Picking a known category slug auto-fills its display label for convenience. */
  function onCategoryChange(nextSlug: string) {
    setCategory(nextSlug);
    const known = BLOG_CATEGORIES.find((entry) => entry.slug === nextSlug);
    if (known) setCategoryLabel(known.label);
  }

  async function onSave() {
    if (!canSave || readOnly) return;
    const parsedMinutes = Number.parseInt(readMinutes, 10);
    const input: BlogPostInput = {
      title: title.trim(),
      slug: slug.trim() || undefined,
      excerpt: excerpt.trim(),
      body,
      category: category.trim() || 'guides',
      categoryLabel: categoryLabel.trim() || 'Guides',
      coverImage: coverImage.trim() || undefined,
      author: author.trim() || undefined,
      readMinutes: Number.isFinite(parsedMinutes) && parsedMinutes > 0 ? parsedMinutes : 4,
      seoTitle: seoTitle.trim() || undefined,
      seoDescription: seoDescription.trim() || undefined,
      lang,
      translationKey: translationKey.trim() || null,
      published,
    };
    try {
      if (post) {
        await update.mutateAsync({ id: post.id, input });
        toast.success('Post updated');
      } else {
        await create.mutateAsync(input);
        toast.success('Post created');
      }
      router.push('/blog');
    } catch (saveError) {
      toast.error('Could not save', { description: normaliseError(saveError).message });
    }
  }

  async function onDelete() {
    if (!post) return;
    try {
      await remove.mutateAsync(post.id);
      toast.success('Post deleted');
      router.push('/blog');
    } catch (deleteError) {
      toast.error('Could not delete', { description: normaliseError(deleteError).message });
    } finally {
      setConfirmDelete(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/blog"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:opacity-80"
      >
        <ArrowLeft className="size-4" /> Blog
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {post ? 'Edit post' : 'New post'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {post
              ? 'Update the article, its metadata and publish state.'
              : 'Draft a new article for the public blog.'}
          </p>
        </div>
        {post && canManage ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="size-4" /> Delete
          </button>
        ) : null}
      </div>

      <div className="space-y-5 rounded-lg border border-hairline bg-surface p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        {/* Title + slug */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className={LABEL_CLASS}>Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={readOnly}
              placeholder="How to spot a rental scam"
              className={FIELD_CLASS}
            />
          </label>
          <label className="block space-y-1.5">
            <span className={LABEL_CLASS}>Slug</span>
            <input
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              disabled={readOnly}
              placeholder="auto-generated"
              className={FIELD_CLASS}
            />
            <span className="text-xs text-muted-foreground">
              Auto-generated from the title if left blank.
            </span>
          </label>
        </div>

        {/* Language + translation link */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className={LABEL_CLASS}>Language</span>
            <select
              value={lang}
              onChange={(event) => setLang(event.target.value === 'fr' ? 'fr' : 'en')}
              disabled={readOnly}
              className={FIELD_CLASS}
            >
              <option value="en">English</option>
              <option value="fr">French</option>
            </select>
            <span className="text-xs text-muted-foreground">
              The post is listed only on the blog in this language.
            </span>
          </label>
          <label className="block space-y-1.5">
            <span className={LABEL_CLASS}>Translation of</span>
            <input
              value={translationKey}
              onChange={(event) => setTranslationKey(event.target.value)}
              disabled={readOnly}
              placeholder="slug of the English version"
              className={FIELD_CLASS}
            />
            <span className="text-xs text-muted-foreground">
              Same value on both language versions links them for search engines and the language switch.
            </span>
          </label>
        </div>

        {/* Excerpt */}
        <label className="block space-y-1.5">
          <span className={LABEL_CLASS}>Excerpt</span>
          <textarea
            value={excerpt}
            onChange={(event) => setExcerpt(event.target.value)}
            disabled={readOnly}
            rows={2}
            placeholder="A short summary shown in listings and previews."
            className={AREA_CLASS}
          />
        </label>

        {/* Body */}
        <label className="block space-y-1.5">
          <span className={LABEL_CLASS}>Body</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={readOnly}
            rows={16}
            placeholder="Write the article here…"
            className={cn(AREA_CLASS, 'font-mono text-[13px] leading-relaxed')}
          />
          <span className="text-xs text-muted-foreground">Markdown is supported.</span>
        </label>

        {/* Category + label */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className={LABEL_CLASS}>Category (slug)</span>
            <input
              value={category}
              onChange={(event) => onCategoryChange(event.target.value)}
              disabled={readOnly}
              list="blog-category-slugs"
              placeholder="guides"
              className={FIELD_CLASS}
            />
            <datalist id="blog-category-slugs">
              {BLOG_CATEGORIES.map((entry) => (
                <option key={entry.slug} value={entry.slug}>
                  {entry.label}
                </option>
              ))}
            </datalist>
            <span className="text-xs text-muted-foreground">
              Pick a known category or type a custom one.
            </span>
          </label>
          <label className="block space-y-1.5">
            <span className={LABEL_CLASS}>Category label</span>
            <input
              value={categoryLabel}
              onChange={(event) => setCategoryLabel(event.target.value)}
              disabled={readOnly}
              list="blog-category-labels"
              placeholder="Guides"
              className={FIELD_CLASS}
            />
            <datalist id="blog-category-labels">
              {BLOG_CATEGORIES.map((entry) => (
                <option key={entry.slug} value={entry.label} />
              ))}
            </datalist>
          </label>
        </div>

        {/* Cover + author + read time */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block space-y-1.5 lg:col-span-2">
            <span className={LABEL_CLASS}>Cover image URL</span>
            <input
              value={coverImage}
              onChange={(event) => setCoverImage(event.target.value)}
              disabled={readOnly}
              placeholder="https://…"
              className={FIELD_CLASS}
            />
          </label>
          <label className="block space-y-1.5">
            <span className={LABEL_CLASS}>Author</span>
            <input
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              disabled={readOnly}
              placeholder="Optional"
              className={FIELD_CLASS}
            />
          </label>
          <label className="block space-y-1.5">
            <span className={LABEL_CLASS}>Read minutes</span>
            <input
              type="number"
              min={1}
              value={readMinutes}
              onChange={(event) => setReadMinutes(event.target.value)}
              disabled={readOnly}
              className={FIELD_CLASS}
            />
          </label>
        </div>

        {/* SEO */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className={LABEL_CLASS}>SEO title</span>
            <input
              value={seoTitle}
              onChange={(event) => setSeoTitle(event.target.value)}
              disabled={readOnly}
              placeholder="Optional - defaults to the title"
              className={FIELD_CLASS}
            />
          </label>
          <label className="block space-y-1.5">
            <span className={LABEL_CLASS}>SEO description</span>
            <input
              value={seoDescription}
              onChange={(event) => setSeoDescription(event.target.value)}
              disabled={readOnly}
              placeholder="Optional - defaults to the excerpt"
              className={FIELD_CLASS}
            />
          </label>
        </div>

        {/* Published toggle */}
        <div className="flex items-center justify-between gap-4 rounded-lg border border-hairline px-4 py-3">
          <div>
            <p className="text-sm font-medium text-ink">Published</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Visible to readers on the public blog. Drafts stay hidden.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={published}
            disabled={readOnly}
            onClick={() => setPublished((value) => !value)}
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
              published ? 'bg-brand-600' : 'bg-slate-300',
            )}
          >
            <span
              className={cn(
                'inline-block size-4 rounded-full bg-white shadow transition-transform',
                published ? 'translate-x-4' : 'translate-x-0.5',
              )}
            />
          </button>
        </div>

        {canManage ? (
          <div className="flex justify-end gap-2 border-t border-hairline pt-4">
            <Link
              href="/blog"
              className="inline-flex items-center gap-1.5 rounded-lg border border-field px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-muted"
            >
              Cancel
            </Link>
            <button
              type="button"
              onClick={onSave}
              disabled={!canSave || pending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {post ? 'Save changes' : 'Create post'}
            </button>
          </div>
        ) : (
          <p className="border-t border-hairline pt-4 text-center text-xs text-muted-foreground">
            You have view-only access - editing requires the “Manage support content” permission.
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete post?"
        description="This permanently removes the article from the blog."
        confirmLabel="Yes, delete"
        tone="danger"
        icon={Trash2}
        confirmIcon={Trash2}
        subject={post ? { label: 'Post', value: post.title } : undefined}
        consequences={['This cannot be undone', 'Readers can no longer reach the article']}
        onConfirm={onDelete}
      />
    </div>
  );
}
