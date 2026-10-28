import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type { BlogPost, BlogPostInput } from './types';

/** Admin blog authoring calls (SRS MOD-13). Gated by support.view/support.manage. */
export const blogApi = {
  async list() {
    const { data } = await api.get<BlogPost[]>(endpoints.admin.blogPosts);
    return data;
  },
  async detail(id: string) {
    const { data } = await api.get<BlogPost>(endpoints.admin.blogPost(id));
    return data;
  },
  async create(input: BlogPostInput) {
    const { data } = await api.post<BlogPost>(endpoints.admin.blogPosts, input);
    return data;
  },
  async update(id: string, input: BlogPostInput) {
    const { data } = await api.put<BlogPost>(endpoints.admin.blogPost(id), input);
    return data;
  },
  async remove(id: string) {
    await api.delete(endpoints.admin.blogPost(id));
  },
};
