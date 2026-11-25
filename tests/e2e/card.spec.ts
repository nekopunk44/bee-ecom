import { expect, test } from '@playwright/test';
import { hive, product } from '../fixtures/catalog.mjs';

const catalog = 'http://127.0.0.1:4321/ru/catalog/';
const cardOf = (page: import('@playwright/test').Page, name: string) =>
  page.locator('[data-card]').filter({ hasText: name });

test('a product saved from its card stays in favorites and leaves them with a tap', async ({
  page,
}) => {
  await page.goto(catalog);
  const card = cardOf(page, product.translations.ru.name);
  await card.getByRole('button', { name: 'В избранное', exact: true }).click();
  const saved = card.getByRole('button', {
    name: 'Убрать из избранного',
    exact: true,
  });
  await expect(saved).toHaveAttribute('aria-pressed', 'true');
  const favorites = page.getByRole('link', { name: 'Избранное', exact: true });
  await expect(favorites).toContainText('1');
  // Список живёт в браузере: после перезагрузки сервер сразу рисует закрашенное сердечко.
  await page.reload();
  await expect(saved).toBeVisible();
  await favorites.click();
  await expect(page).toHaveURL(/\/ru\/favorites\/$/);
  const listed = page.locator('[data-card]');
  await expect(listed).toHaveCount(1);
  await listed
    .getByRole('button', { name: 'Убрать из избранного', exact: true })
    .click();
  await expect(listed).toHaveCount(0);
  await expect(page.getByText('Здесь появятся товары')).toBeVisible();
  await expect(favorites).not.toContainText('1');
});

test('the card adds a single variant at once and asks which one when there are several', async ({
  page,
}) => {
  const posted: unknown[] = [];
  await page.route(
    (url) => url.pathname === '/api/v1/cart',
    (route) => route.fulfill({ json: { items: [] } }),
  );
  await page.route(
    (url) => url.pathname === '/api/v1/cart/items',
    async (route) => {
      posted.push(route.request().postDataJSON());
      await route.fulfill({ json: { items: [] } });
    },
  );
  await page.goto(catalog);
  const single = cardOf(page, product.translations.ru.name);
  await single.getByRole('button', { name: 'В корзину' }).click();
  await expect(single.locator('[data-to-cart]')).toHaveAttribute(
    'data-state',
    'added',
  );
  expect(posted).toEqual([{ variantId: product.variants[0]!.id, quantity: 1 }]);

  const several = cardOf(page, hive.translations.ru.name);
  await several.getByRole('button', { name: 'В корзину' }).click();
  const choice = several.getByText('Выберите вариант');
  await expect(choice).toBeVisible();
  await several.getByRole('button', { name: /Окрашенный/ }).click();
  await expect(choice).toBeHidden();
  await expect.poll(() => posted.length).toBe(2);
  expect(posted[1]).toEqual({ variantId: hive.variants[1]!.id, quantity: 1 });
});

test('a guest is sent to sign in when adding from the card', async ({
  page,
}) => {
  await page.route(
    (url) => url.pathname === '/api/v1/cart',
    (route) =>
      route.fulfill({
        status: 401,
        json: {
          error: { code: 'UNAUTHORIZED', message: 'No', requestId: 'test' },
        },
      }),
  );
  await page.goto(catalog);
  const card = cardOf(page, product.translations.ru.name);
  await card.getByRole('button', { name: 'В корзину' }).click();
  await expect(
    card.getByRole('link', { name: 'Войдите, чтобы добавить товар' }),
  ).toHaveAttribute('href', '/ru/account/');
});

test('a card with several photos flips through them under the mouse', async ({
  page,
}) => {
  await page.goto(catalog);
  const picture = cardOf(page, product.translations.ru.name).locator(
    '[data-gallery]',
  );
  const dots = picture.locator('.dots > span');
  await expect(dots).toHaveCount(3);
  const box = await picture.boundingBox();
  if (!box) throw new Error('no picture');
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2);
  await expect(dots.nth(2)).toHaveAttribute('data-current', '');
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
  await expect(dots.nth(1)).toHaveAttribute('data-current', '');
  await page.mouse.move(0, 0);
  await expect(dots.nth(0)).toHaveAttribute('data-current', '');
});

test('demo photos are credited to their authors', async ({ page }) => {
  await page.goto('http://127.0.0.1:4321/ru/photo-credits/');
  await expect(
    page.getByRole('heading', { name: 'Авторы фото', level: 1 }),
  ).toBeVisible();
  const sources = page.getByRole('link', { name: 'Источник' });
  expect(await sources.count()).toBeGreaterThan(20);
  await expect(sources.first()).toHaveAttribute(
    'href',
    /^https:\/\/commons\.wikimedia\.org\//,
  );
  await expect(
    page.getByRole('contentinfo').getByRole('link', { name: 'Авторы фото' }),
  ).toBeVisible();
});
