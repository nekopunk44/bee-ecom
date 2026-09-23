import type { APIRoute } from 'astro';
export const GET: APIRoute = ({ site }) =>
  new Response(
    process.env.ENABLE_INDEXING === 'true'
      ? `User-agent: *\nDisallow: /api/\nSitemap: ${new URL('/sitemap.xml', site)}\n`
      : 'User-agent: *\nDisallow: /\n',
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
