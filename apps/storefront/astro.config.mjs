import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import svelte from '@astrojs/svelte';
import vercel from '@astrojs/vercel';

// Vercel sets VERCEL=1 for its builds; Docker and local runs keep the Node server.
const onVercel = Boolean(process.env.VERCEL);
const vercelSite = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : undefined;

export default defineConfig({
  site: process.env.SITE_URL ?? vercelSite ?? 'http://localhost:8080',
  output: 'server',
  adapter: onVercel ? vercel() : node({ mode: 'standalone' }),
  integrations: [svelte()],
  build: { inlineStylesheets: 'never' },
  server: { port: 4321 },
});
