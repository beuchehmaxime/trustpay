import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { blogApi } from './blog.api';
import type { BlogPostInput } from './types';

const BLOG_KEY = ['admin', 'blog'] as const;

export function useBlogPosts(enabled = true) {
  return useQuery({
    queryKey: [...BLOG_KEY, 'list'],
    queryFn: () => blogApi.list(),
    enabled,
  });
}

export function useBlogPost(id: string | null) {
  return useQuery({
    queryKey: [...BLOG_KEY, 'detail', id],
    queryFn: () => blogApi.detail(id as string),
    enabled: !!id,
  });
}

/** Create/update/delete a post; each invalidates the blog queries. */
export function useBlogActions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: BLOG_KEY });
  return {
    create: useMutation({
      mutationFn: (input: BlogPostInput) => blogApi.create(input),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: BlogPostInput }) =>
        blogApi.update(id, input),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => blogApi.remove(id),
      onSuccess: invalidate,
    }),
  };
}
