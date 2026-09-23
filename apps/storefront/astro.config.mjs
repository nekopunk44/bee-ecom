import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import svelte from '@astrojs/svelte';

export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:8080',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [svelte()],
  build: { inlineStylesheets: 'never' },
  server: { port: 4321 },
});
