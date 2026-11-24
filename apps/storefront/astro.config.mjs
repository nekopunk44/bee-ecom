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
  // Астро сам считает хэши своих встроенных скриптов и стилей (загрузчики островков)
  // и кладёт их в <meta> с политикой. Заголовок CSP на Vercel и в nginx их пропускает.
  security: {
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      scriptDirective: { resources: ["'self'"] },
      styleDirective: { resources: ["'self'"] },
    },
  },
  // Мелкие файлы (шрифт, короткие скрипты) не встраиваются в страницу: CSP их бы
  // заблокировала. Всё отдаётся отдельными файлами с этого же сайта.
  vite: { build: { assetsInlineLimit: 0 } },
  server: { port: 4321 },
});
