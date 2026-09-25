import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';

const posts = defineCollection({
  loader: glob({
    pattern: '**/*.{md,mdx}',
    base: './src/content/posts',
    generateId: ({ entry }) => entry.replace(/\.(md|mdx)$/, ''),
  }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string(),
    slug: z.string().min(1),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    series: z
      .object({ id: z.string(), order: z.number().int().positive().optional() })
      .optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    originalUrl: z.url().optional(),
    thumbnail: z.url().optional(),
  }),
});
const series = defineCollection({
  loader: file('./src/content/series.json'),
  schema: z.object({
    name: z.string(),
    slug: z.string(),
    description: z.string(),
    originalUrl: z.url().optional(),
  }),
});
export const collections = { posts, series };
