import { expect, test } from '@playwright/test';
import { product } from '../fixtures/catalog.mjs';

const variant = product.variants[0]!;

/** Кнопка рендерится на сервере, но работает только после гидратации островка Astro. */
async function hydrated(page: import('@playwright/test').Page) {
  await page
    .getByRole('button', { name: 'В корзину' })
    .scrollIntoViewIfNeeded();
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
}

/** Корзина на сервере подменена: POST задаёт количество, как настоящий API. */
function cartServer(page: import('@playwright/test').Page) {
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

test('товар добавляется в корзину повторно, количество растёт и меняется в корзине', async ({
  page,
}) => {
  const items = await cartServer(page);
  await page.goto(`http://127.0.0.1:4321/ru/catalog/${product.slug}/`);
  await hydrated(page);
  const add = page.getByRole('button', { name: 'В корзину' });
  await add.click();
  await expect(page.getByRole('button', { name: 'Добавлено' })).toBeVisible();
  await page.getByRole('button', { name: 'Добавлено' }).click();
  await expect.poll(() => items.get(variant.id)).toBe(2);

  await page.getByRole('link', { name: 'Корзина' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Корзина');
  await expect(
    page.getByText(`Стандарт, артикул ${variant.sku}`),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Увеличить количество' }).click();
  await expect.poll(() => items.get(variant.id)).toBe(3);
  await page.getByRole('button', { name: 'Удалить' }).click();
  await expect(page.getByText('Корзина пока пуста.')).toBeVisible();
});

test('без входа корзина просит войти в аккаунт', async ({ page }) => {
  await page.route(
    (url) => url.pathname === '/api/v1/cart',
    (route) =>
      route.fulfill({
        status: 401,
        json: {
          error: {
            code: 'AUTH_REQUIRED',
            message: 'Sign in',
            requestId: 'test',
          },
        },
      }),
  );
  await page.goto(`http://127.0.0.1:4321/ru/catalog/${product.slug}/`);
  await hydrated(page);
  await page.getByRole('button', { name: 'В корзину' }).click();
  // Гостю открывается окно входа, а не другая страница.
  const dialog = page.getByRole('dialog', { name: 'Аккаунт' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.goto('http://127.0.0.1:4321/ru/cart/');
  await expect(
    page.getByText('Войдите в аккаунт, чтобы посмотреть свою корзину.'),
  ).toBeVisible();
  await page.locator('main').getByRole('button', { name: 'Войти' }).click();
  await expect(dialog).toBeVisible();
});
