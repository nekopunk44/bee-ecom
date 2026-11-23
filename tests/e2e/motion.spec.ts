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

/** Пчела летит к корзине и убирается сама: живёт она недолго. */
function flyingBee(page: Page) {
  return page.locator('body > .flying-bee[aria-hidden="true"]');
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

test('reduced motion keeps the still hero picture instead of the 3D story', async ({
  browser,
}) => {
  const { context, page } = await open(browser, { reducedMotion: 'reduce' });
  await page.goto(home);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Хорошая пасека',
  );
  await page.waitForTimeout(1000);
  await expect(page.locator('[data-story]')).not.toHaveClass(/story--live/);
  await expect(page.locator('[data-story-canvas]')).toBeHidden();
  await expect(page.locator('.art')).toBeVisible();
  await expect
    .poll(style(page, '.bee-body', 'animation-iteration-count'))
    .toBe('1');
  await expect.poll(style(page, 'h1', 'opacity')).toBe('1');
  await context.close();
});

test('without WebGL the home page keeps the still hero picture', async ({
  browser,
}) => {
  const { context, page } = await open(browser);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (type.startsWith('webgl')) return null;
      return (original as (...args: unknown[]) => unknown).call(
        this,
        type,
        ...rest,
      );
    } as typeof original;
  });
  await page.goto(home);
  await page.waitForTimeout(1500);
  await expect(page.locator('[data-story]')).not.toHaveClass(/story--live/);
  await expect(page.locator('.art')).toBeVisible();
  await expect(page.getByLabel('Что ищете')).toBeVisible();
  await context.close();
});

test('the home page tells the hive story in 3D while scrolling', async ({
  browser,
}) => {
  const { context, page } = await open(browser);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(home);
  const story = page.locator('[data-story]');
  await expect(story).toHaveClass(/story--live/);
  await expect(page.locator('[data-story-canvas]')).toBeVisible();
  await expect(page.locator('.art')).toBeHidden();
  // Части улья подписаны, когда история доходит до первой главы.
  const parts = page.locator('[data-part]');
  await expect(parts).toHaveCount(5);
  await page
    .getByRole('heading', { name: /Корпуса, магазины и рамки/ })
    .evaluate((heading) =>
      heading.closest('.story-step')?.scrollIntoView({ block: 'start' }),
    );
  await expect
    .poll(() =>
      parts.first().evaluate((part) => Number(getComputedStyle(part).opacity)),
    )
    .toBeGreaterThan(0.9);
  // В конце истории поиск по-прежнему работает поверх сот.
  await page.getByLabel('Что ищете').scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Найти' })).toBeVisible();
  // Сцена кончается вместе с историей и не закрывает каталог под ней.
  await page
    .getByRole('heading', { name: 'Каталог', level: 2 })
    .scrollIntoViewIfNeeded();
  const stageBelowStory = await page.evaluate(() => {
    const stage = document.querySelector('[data-story-stage]');
    const story = document.querySelector('[data-story]');
    if (!stage || !story) return Number.NaN;
    return (
      stage.getBoundingClientRect().bottom -
      story.getBoundingClientRect().bottom
    );
  });
  expect(stageBelowStory).toBeLessThanOrEqual(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
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

test('reduced motion skips the flying bee on add to cart', async ({
  browser,
}) => {
  const { context, page } = await open(browser, { reducedMotion: 'reduce' });
  const items = await cartServer(page);
  await page.goto(`${storefront}/ru/catalog/${product.slug}/`);
  await hydrated(page);
  await page.getByRole('button', { name: 'В корзину' }).click();
  await expect(page.getByRole('button', { name: 'Добавлено' })).toBeVisible();
  await expect.poll(() => items.get(variant.id)).toBe(1);
  await expect(flyingBee(page)).toHaveCount(0);
  await context.close();
});

test('without reduced motion a bee flies to the cart for a moment', async ({
  browser,
}) => {
  const { context, page } = await open(browser);
  const items = await cartServer(page);
  await page.goto(`${storefront}/ru/catalog/${product.slug}/`);
  await hydrated(page);
  // Пчела живёт меньше секунды: ждём её появления с самого нажатия, а не опросом.
  const flight = flyingBee(page).waitFor({ state: 'attached', timeout: 3000 });
  await page.getByRole('button', { name: 'В корзину' }).click();
  await flight;
  await expect(page.getByRole('button', { name: 'Добавлено' })).toBeVisible();
  await expect.poll(() => items.get(variant.id)).toBe(1);
  await context.close();
});

test('catalog cards tilt toward the pointer unless motion is reduced', async ({
  browser,
}) => {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    const { context, page } = await open(browser, { reducedMotion });
    await page.goto(`${storefront}/ru/catalog/`);
    const picture = page.locator('[data-tilt]').first();
    await picture.scrollIntoViewIfNeeded();
    await page.waitForLoadState('networkidle');
    const box = await picture.boundingBox();
    if (!box) throw new Error('product card is not visible');
    await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.2);
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.15);
    const tilt = () =>
      picture.evaluate((el) =>
        (el as HTMLElement).style.getPropertyValue('--tilt-y'),
      );
    if (reducedMotion === 'reduce') {
      await page.waitForTimeout(300);
      expect(await tilt()).toBe('');
    } else {
      await expect.poll(tilt).toMatch(/^\d/);
    }
    await context.close();
  }
});

test('an empty search shows living honeycomb instead of a bare message', async ({
  browser,
}) => {
  const { context, page } = await open(browser);
  await page.goto(
    `${storefront}/ru/catalog/?q=${encodeURIComponent('ничего-такого-нет')}`,
  );
  await expect(page.getByText('Товары не найдены')).toBeVisible();
  const comb = page.locator('canvas[data-comb-field]');
  await expect(comb).toBeVisible();
  const box = await comb.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThan(100);
  await context.close();
});
