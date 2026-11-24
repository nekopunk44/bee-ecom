import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { product } from '../fixtures/catalog.mjs';

const storefront = 'http://127.0.0.1:4321';
type VercelConfig = {
  headers: { headers: { key: string; value: string }[] }[];
};
const vercel = JSON.parse(
  readFileSync(resolve('apps/storefront/vercel.json'), 'utf8'),
) as VercelConfig;
const deployed = vercel.headers
  .flatMap((rule) => rule.headers)
  .find((header) => header.key === 'Content-Security-Policy')?.value;

/**
 * Как на Vercel: к политике, которую Astro присылает с хэшами своих встроенных скриптов,
 * добавляется заголовок из vercel.json. Браузер соблюдает обе (через запятую — это две
 * политики). Локальный сервер витрины второй политики не шлёт, поэтому без этого теста
 * заблокированные загрузчики островков на проде было не заметить.
 */
async function withDeployedPolicy(page: Page) {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy'))
      violations.push(message.text().slice(0, 200));
  });
  await page.route(`${storefront}/**`, async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    const headers = response.headers();
    const own = headers['content-security-policy'];
    headers['content-security-policy'] = [own, deployed]
      .filter(Boolean)
      .join(', ');
    await route.fulfill({ response, headers });
  });
  return violations;
}

test('the deployed content security policy blocks nothing on storefront pages', async ({
  page,
}) => {
  expect(deployed).toBeTruthy();
  const violations = await withDeployedPolicy(page);
  for (const path of [
    '/ru/',
    '/ru/catalog/',
    `/ru/catalog/${product.slug}/`,
    '/ru/cart/',
    '/ru/account/',
    '/ru/checkout/',
  ]) {
    await page.goto(`${storefront}${path}`);
    await page.waitForLoadState('networkidle');
  }
  expect(violations).toEqual([]);
});

test('interactive blocks and the 3D story start under the deployed policy', async ({
  page,
}) => {
  await withDeployedPolicy(page);
  await page.goto(`${storefront}/ru/account/`);
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await page.goto(`${storefront}/ru/catalog/${product.slug}/`);
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'В корзину' })).toBeEnabled();
  await page.goto(`${storefront}/ru/`);
  await expect(page.locator('[data-story]')).toHaveClass(/story--live/);
});
