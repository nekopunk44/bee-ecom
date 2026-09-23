import type { APIRoute } from 'astro';
import { catalogApi } from '../lib/catalog';
export const GET: APIRoute = async ({ site }) => {
  if (process.env.ENABLE_INDEXING !== 'true')
    return new Response('Indexing disabled', { status: 404 });
  try {
    const { data } = await catalogApi().GET('/api/v1/products', {
      params: { query: { limit: 48 } },
      signal: AbortSignal.timeout(5000),
    });
    if (!data) return new Response('Catalog unavailable', { status: 503 });
    const pages = Math.max(1, Math.ceil(data.total / 48));
    const entries = Array.from(
      { length: pages },
      (_, index) =>
        `<sitemap><loc>${new URL(`/sitemaps/${index + 1}.xml`, site)}</loc></sitemap>`,
    ).join('');
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`,
      { headers: { 'Content-Type': 'application/xml' } },
    );
  } catch {
    return new Response('Catalog unavailable', { status: 503 });
  }
};
