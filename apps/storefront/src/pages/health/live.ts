import type { APIRoute } from 'astro';
export const GET: APIRoute = () =>
  Response.json(
    { status: 'ok', service: 'bee-storefront' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
