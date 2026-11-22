import { expect, test } from '@playwright/test';
import type { Browser, BrowserContextOptions, Page } from '@playwright/test';
import { product } from '../fixtures/catalog.mjs';

const variant = product.variants[0]!;
const storefront = 'http://127.0.0.1:4321';
const home = `${storefront}/ru/`;

async function open(browser: Browser, options: BrowserContextOptions = {}) {
  const context = await browser.newContext(options);
  return { context, page: await context.newPage() };
}

/** Кнопка рендерится на сервере, но работает только после гидратации островка Astro. */
async function hydrated(page: Page) {
  await page
    .getByRole('button', { name: 'В корзину' })
    .scrollIntoViewIfNeeded();
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
}

/** Корзина на сервере подменена: POST задаёт количество, как настоящий API. */
function cartServer(page: Page) {
  const items = new Map<string, number>();
  const document = () => ({
    items: [...items].map(([variantId, quantity]) => ({
      variantId,
      productSlug: product.slug,
      sku: variant.sku,
      name: product.translations.ru.name,
      variantName: 'Стандарт',
      quantity,
      unitPriceMinor: 125050,
      currency: 'MDL',
      available: 7,
    })),
  });
  return Promise.all([
    page.route(
      (url) => url.pathname === '/api/v1/cart',
      (route) => route.fulfill({ json: document() }),
    ),
    page.route(
      (url) => url.pathname === '/api/v1/cart/items',
      async (route) => {
        const body = route.request().postDataJSON();
        items.set(body.variantId, body.quantity);
        await route.fulfill({ json: document() });
      },
    ),
    page.route(
      (url) => url.pathname.startsWith('/api/v1/cart/items/'),
      async (route) => {
        items.delete(
          new URL(route.request().url()).pathname.split('/').pop() ?? '',
        );
        await route.fulfill({ json: document() });
      },
    ),
  ]).then(() => items);
}

/** Сота перелетает к корзину и убирается сама: живёт она недолго. */
function flyingHoneycomb(page: Page) {
  return page.locator('body > div[aria-hidden="true"]');
}

/** Снимок computed style: expect.poll дождётся нужного значения. */
function style(page: Page, selector: string, property: string) {
  return () =>
    page
      .locator(selector)
      .evaluate(
        (el, name) => window.getComputedStyle(el).getPropertyValue(name),
        property,
      );
}

test('reduced motion stops the hero bee and shows the heading at once', async ({
  browser,
}) => {
  const { context, page } = await open(browser, { reducedMotion: 'reduce' });
  await page.goto(home);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Хорошая пасека',
  );
  await expect
    .poll(style(page, '.bee-body', 'animation-iteration-count'))
    .toBe('1');
  await expect.poll(style(page, 'h1', 'opacity')).toBe('1');
  await context.close();
});

test('without reduced motion the hero bee keeps flying', async ({
  browser,
}) => {
  const { context, page } = await open(browser);
  await page.goto(home);
  await expect
    .poll(style(page, '.bee-body', 'animation-iteration-count'))
    .toBe('infinite');
  await expect.poll(style(page, '.bee-body', 'animation-name')).toMatch(/\S/);
  await context.close();
});

test('every reveal block becomes visible after it is scrolled into view', async ({
  browser,
}) => {
  for (const reducedMotion of ['reduce', 'no-preference'] as const) {
    const { context, page } = await open(browser, { reducedMotion });
    await page.goto(home);
    const blocks = page.locator('[data-reveal]');
    expect(await blocks.count()).toBeGreaterThan(0);
    for (let i = 0; i < (await blocks.count()); i++) {
      const block = blocks.nth(i);
      await block.scrollIntoViewIfNeeded();
      await expect
        .poll(() => block.evaluate((el) => window.getComputedStyle(el).opacity))
        .toBe('1');
    }
    await context.close();
  }
});

test('reduced motion skips the flying honeycomb on add to cart', async ({
  browser,
}) => {
  const { context, page } = await open(browser, { reducedMotion: 'reduce' });
  const items = await cartServer(page);
  await page.goto(`${storefront}/ru/catalog/${product.slug}/`);
  await hydrated(page);
  await page.getByRole('button', { name: 'В корзину' }).click();
  await expect(page.getByRole('button', { name: 'Добавлено' })).toBeVisible();
  await expect.poll(() => items.get(variant.id)).toBe(1);
  await expect(flyingHoneycomb(page)).toHaveCount(0);
  await context.close();
});

test('without reduced motion the flying honeycomb flies for a moment', async ({
  browser,
}) => {
  const { context, page } = await open(browser);
  const items = await cartServer(page);
  await page.goto(`${storefront}/ru/catalog/${product.slug}/`);
  await hydrated(page);
  await page.getByRole('button', { name: 'В корзину' }).click();
  await expect
    .poll(() => flyingHoneycomb(page).count(), { timeout: 2000 })
    .toBe(1);
  await expect(page.getByRole('button', { name: 'Добавлено' })).toBeVisible();
  await expect.poll(() => items.get(variant.id)).toBe(1);
  await context.close();
});
