import { expect, test } from '@playwright/test';
import { product, metadata } from '../fixtures/catalog.mjs';

test('catalog search and translated product render without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4321/ru/catalog/');
  await page
    .getByRole('link', { name: product.translations.ru.name, exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    product.translations.ru.name,
  );
  await expect(page.getByText('Артикул: DADAN-10')).toBeVisible();
  const structured = JSON.parse(
    await page.locator('script[type="application/ld+json"]').innerText(),
  );
  expect(structured.offers[0].price).toBe('1250.50');
  await page.getByRole('link', { name: 'RO', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    product.translations.ro.name,
  );
  await page.goto('http://127.0.0.1:4321/ru/catalog/');
  await page.getByLabel('Поиск по каталогу').fill('нет-товара');
  await page.getByLabel('Поиск по каталогу').press('Enter');
  await expect(
    page.getByText('Товары не найдены.', { exact: false }),
  ).toBeVisible();
  await context.close();
});
test('catalog outage is a 503 and missing product is a 404', async ({
  request,
}) => {
  expect(
    (
      await request.get('http://127.0.0.1:4321/ru/catalog/?q=unavailable')
    ).status(),
  ).toBe(503);
  expect(
    (await request.get('http://127.0.0.1:4321/ru/catalog/missing/')).status(),
  ).toBe(404);
});
test('admin creates a translated product and keeps entered fields on revision conflict', async ({
  page,
}) => {
  await page.route('**/api/v1/auth/session', (route) =>
    route.fulfill({
      json: {
        email: 'editor@example.test',
        permissions: ['products.read', 'products.write', 'media.write'],
      },
    }),
  );
  await page.route('**/api/v1/catalog/metadata*', (route) =>
    route.fulfill({ json: metadata }),
  );
  let creates = 0;
  await page.route('**/api/v1/admin/products*', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      const draft = request.postDataJSON();
      expect(draft.translations.ro.name).toBe('Stup nou');
      expect(draft.variants[0].priceMinor).toBe(12345);
      creates++;
      await route.fulfill({ status: 201, json: { ...product, ...draft } });
    } else
      await route.fulfill({
        json: { items: [product], total: 1, page: 1, limit: 12 },
      });
  });
  await page.route(`**/api/v1/admin/products/${product.id}`, (route) =>
    route.fulfill({
      status: 409,
      json: {
        error: {
          code: 'REVISION_CONFLICT',
          message: 'Conflict',
          requestId: 'test',
        },
      },
    }),
  );
  await page.goto('http://127.0.0.1:4173');
  await page.getByRole('button', { name: 'Новый товар', exact: true }).click();
  await page.getByLabel('Адрес товара').fill('new-hive');
  await page.getByLabel('Ульи', { exact: true }).check();
  await page.getByLabel('Название (ru)', { exact: true }).fill('Новый улей');
  await page.getByLabel('Название (ro)', { exact: true }).fill('Stup nou');
  await page.getByLabel('Артикул', { exact: true }).fill('NEW-001');
  await page.getByLabel('Цена, MDL').fill('123.45');
  await page.getByRole('button', { name: 'Сохранить товар' }).click();
  await expect(
    page.getByText('Товар сохранён.', { exact: true }),
  ).toBeVisible();
  expect(creates).toBe(1);
  await page
    .getByRole('button', {
      name: `Открыть товар ${product.translations.ru.name}`,
    })
    .click();
  await page
    .getByLabel('Название (ru)', { exact: true })
    .fill('Моя несохранённая правка');
  await page.getByRole('button', { name: 'Сохранить товар' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Товар изменён другим сотрудником',
  );
  await expect(page.getByLabel('Название (ru)', { exact: true })).toHaveValue(
    'Моя несохранённая правка',
  );
});
test('read-only user sees catalog without mutation controls', async ({
  page,
}) => {
  await page.route('**/api/v1/auth/session', (route) =>
    route.fulfill({
      json: { email: 'reader@example.test', permissions: ['products.read'] },
    }),
  );
  await page.route('**/api/v1/catalog/metadata*', (route) =>
    route.fulfill({ json: metadata }),
  );
  await page.route('**/api/v1/admin/products*', (route) =>
    route.fulfill({ json: { items: [product], total: 1, page: 1, limit: 12 } }),
  );
  await page.goto('http://127.0.0.1:4173');
  await expect(
    page.getByRole('cell', { name: product.translations.ru.name }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Новый товар' })).toHaveCount(
    0,
  );
});
test('admin list filters by status and shows what is left on each warehouse', async ({
  page,
}) => {
  const asked: URL[] = [];
  await page.route('**/api/v1/auth/session', (route) =>
    route.fulfill({
      json: { email: 'reader@example.test', permissions: ['products.read'] },
    }),
  );
  await page.route('**/api/v1/catalog/metadata*', (route) =>
    route.fulfill({ json: metadata }),
  );
  await page.route('**/api/v1/admin/products*', (route) => {
    asked.push(new URL(route.request().url()));
    return route.fulfill({
      json: {
        items: [
          {
            ...product,
            stock: {
              onHand: 3,
              reserved: 1,
              warehouses: [
                {
                  code: 'chisinau',
                  name: 'Кишинёв, основной склад',
                  onHand: 3,
                  reserved: 1,
                },
              ],
            },
          },
        ],
        total: 1,
        page: 1,
        limit: 8,
      },
    });
  });
  await page.goto('http://127.0.0.1:4173');
  const list = page.getByRole('region', { name: 'Список товаров' });
  // На компьютере товары в таблице; карточки для телефона скрыты.
  const table = list.getByRole('table');
  await expect(table.getByText('3 шт')).toBeVisible();
  await expect(table.getByText('мало')).toBeVisible();
  await expect(table.getByText('Кишинёв 3')).toBeVisible();
  // Вкладка статуса уходит в запрос, номера страницы сбрасываются на первую.
  await list.getByRole('button', { name: 'Черновики' }).click();
  await expect
    .poll(() => asked.at(-1)?.searchParams.get('status'))
    .toBe('draft');
  expect(asked.at(-1)?.searchParams.get('page')).toBe('1');
});
test('catalog filters apply at once and show as removable chips', async ({
  page,
}) => {
  // Скрипт формы мог ещё не загрузиться: тогда нажатие на категорию ничего не отправит.
  const ready = () =>
    expect(page.locator('form[data-filters][data-ready]')).toHaveCount(1);
  await page.goto('http://127.0.0.1:4321/ru/catalog/');
  await ready();
  // Категория применяется сразу, без кнопки; пустые поля в адрес не попадают.
  await page.getByText('Ульи', { exact: true }).click();
  await expect(page).toHaveURL(/\/ru\/catalog\/\?category=[^&]+$/);
  const chips = page.getByRole('list', { name: 'Выбранные фильтры' });
  await expect(
    chips.getByRole('link', { name: 'Убрать фильтр: Ульи' }),
  ).toBeVisible();
  // Цена: ползунок и поля связаны, кнопка заранее показывает, сколько товаров найдётся.
  await page.route('**/api/v1/products?*', (route) =>
    route.fulfill({ json: { items: [], total: 3, page: 1, limit: 1 } }),
  );
  await page.getByRole('slider', { name: 'Нижняя граница цены' }).fill('60');
  await expect(page.getByLabel('Цена от, MDL')).toHaveValue('61');
  const apply = page.getByRole('button', { name: 'Показать 3 товара' });
  await expect(apply).toBeVisible();
  await page.getByLabel('Цена до, MDL').fill('1 000');
  await expect(
    page.getByRole('slider', { name: 'Верхняя граница цены' }),
  ).not.toHaveValue('240');
  await expect(page.locator('[data-column][data-selected]')).not.toHaveCount(
    24,
  );
  await apply.click();
  await expect(page).toHaveURL(/min=61&max=1000/);
  await expect(
    chips.getByRole('link', { name: 'Убрать фильтр: 61–1 000 L' }),
  ).toBeVisible();
  // Сортировка кнопками над товарами сохраняет фильтры.
  await page.getByRole('link', { name: 'Цена по возрастанию' }).click();
  await expect(page).toHaveURL(/sort=price_asc/);
  await expect(page).toHaveURL(/category=/);
  // Крестик на чипе убирает только свой фильтр.
  await chips.getByRole('link', { name: 'Убрать фильтр: Ульи' }).click();
  await expect(page).not.toHaveURL(/category=/);
  await expect(page).toHaveURL(/min=61/);
  await page.getByRole('link', { name: 'Сбросить всё' }).click();
  await expect(page).toHaveURL(/\/ru\/catalog\/$/);
  // Повторное нажатие на выбранную категорию снимает выбор.
  await ready();
  await page.getByText('Ульи', { exact: true }).click();
  await expect(page).toHaveURL(/category=/);
  await ready();
  await page.getByText('Ульи', { exact: true }).click();
  await expect(page).toHaveURL(/\/ru\/catalog\/$/);
});
