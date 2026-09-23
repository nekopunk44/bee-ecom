import type { APIRoute } from 'astro';
import { catalogApi } from '../../lib/catalog';
export const GET: APIRoute = async ({ params, site }) => {
  const page = Number(params.page);
  if (
    process.env.ENABLE_INDEXING !== 'true' ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 10000
  )
    return new Response('Not found', { status: 404 });
  try {
    const { data } = await catalogApi().GET('/api/v1/products', {
      params: { query: { page, limit: 48 } },
      signal: AbortSignal.timeout(5000),
    });
    if (!data) return new Response('Catalog unavailable', { status: 503 });
    if (page > Math.max(1, Math.ceil(data.total / 48)))
      return new Response('Not found', { status: 404 });
    const paths = data.items.flatMap((product) =>
      ['ru', 'ro'].map((locale) => `/${locale}/catalog/${product.slug}/`),
    );
    if (page === 1)
      paths.unshift('/ru/', '/ro/', '/ru/catalog/', '/ro/catalog/');
    const entries = paths
      .map((path) => `<url><loc>${new URL(path, site)}</loc></url>`)
      .join('');
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`,
      { headers: { 'Content-Type': 'application/xml' } },
    );
  } catch {
    return new Response('Catalog unavailable', { status: 503 });
  }
};
