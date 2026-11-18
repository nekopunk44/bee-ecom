import { expect, test, type Page, type Route } from '@playwright/test';
import { product } from '../fixtures/catalog.mjs';

const variant = product.variants[0]!;
const orderId = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const mainWarehouse = '0b7a4c1e-2f3d-4a5b-8c6d-7e8f9a0b1c2d';
const smallWarehouse = '1c8b5d2f-3a4e-4b6c-9d7e-8f9a0b1c2d3e';

const cartItem = {
  variantId: variant.id,
  productSlug: product.slug,
  sku: variant.sku,
  name: product.translations.ru.name,
  variantName: 'Стандарт',
  quantity: 2,
  unitPriceMinor: 125050,
  currency: 'MDL',
  available: 7,
};

const checkout = {
  cart: { items: [cartItem] },
  itemsTotalMinor: 250100,
  courierPriceMinor: 5000,
  warehouses: [
    { id: mainWarehouse, name: 'Кишинёв, Мунчештская 15', ready: true },
    { id: smallWarehouse, name: 'Бельцы, Индепенденцей 3', ready: false },
  ],
};

const failure = (route: Route, status: number, code: string) =>
  route.fulfill({
    status,
    json: { error: { code, message: code, requestId: 'test' } },
  });

/** Заказ, каким его вернёт API после оформления курьером. */
function placedOrder(status: 'new' | 'cancelled' = 'new') {
  const created = '2026-11-18T13:20:00Z';
  return {
    id: orderId,
    number: 'B-1001',
    status,
    createdAt: created,
    updatedAt: created,
    deliveryMethod: 'courier',
    warehouse: null,
    recipientName: 'Ион Попеску',
    phone: '+37369123456',
    locality: null,
    address: 'ул. Пушкина 10, кв. 5',
    postalCode: null,
    comment: null,
    itemsTotalMinor: 250100,
    deliveryPriceMinor: 5000,
    totalMinor: 255100,
    currency: 'MDL',
    paymentMethod: 'on_delivery',
    trackingNumber: null,
    items: [
      {
        variantId: variant.id,
        productSlug: product.slug,
        sku: variant.sku,
        name: product.translations.ru.name,
        variantName: 'Стандарт',
        unitPriceMinor: 125050,
        quantity: 2,
      },
    ],
    history:
      status === 'new'
        ? [{ status: 'new', at: created }]
        : [
            { status: 'new', at: created },
            { status: 'cancelled', at: '2026-11-18T13:25:00Z' },
          ],
  };
}

async function checkoutPage(page: Page) {
  await page.route(
    (url) => url.pathname === '/api/v1/checkout',
    (route) => route.fulfill({ json: checkout }),
  );
  await page.goto('http://127.0.0.1:4321/ru/checkout/');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
}

test('заказ курьером: ошибка телефона подсвечивает поле, после исправления заказ оформляется и отменяется', async ({
  page,
}) => {
  const requests: { key: string | null; body: Record<string, unknown> }[] = [];
  let cancelled = false;
  await page.route(
    (url) => url.pathname === '/api/v1/orders',
    async (route) => {
      requests.push({
        key: await route.request().headerValue('idempotency-key'),
        body: route.request().postDataJSON(),
      });
      if (requests.length === 1) return failure(route, 422, 'INVALID_PHONE');
      return route.fulfill({ status: 201, json: placedOrder() });
    },
  );
  await page.route(
    (url) => url.pathname === `/api/v1/orders/${orderId}`,
    (route) =>
      route.fulfill({ json: placedOrder(cancelled ? 'cancelled' : 'new') }),
  );
  await page.route(
    (url) => url.pathname === `/api/v1/orders/${orderId}/cancel`,
    (route) => {
      cancelled = true;
      return route.fulfill({ json: placedOrder('cancelled') });
    },
  );
  await checkoutPage(page);

  await expect(page.getByText('50,00')).toBeVisible();
  await page.getByLabel('Адрес', { exact: true }).fill('ул. Пушкина 10, кв. 5');
  await page.getByLabel('Имя и фамилия').fill('Ион Попеску');
  await page.getByLabel('Телефон').fill('12345');
  await page.getByRole('button', { name: 'Подтвердить заказ' }).click();

  const phone = page.getByLabel('Телефон');
  await expect(phone).toHaveAttribute('aria-invalid', 'true');
  await expect(phone).toBeFocused();
  await expect(page.getByText('Укажите молдавский номер')).toBeVisible();

  await phone.fill('069 123 456');
  await page.getByRole('button', { name: 'Подтвердить заказ' }).click();
  await expect(page).toHaveURL(/\/ru\/orders\/[0-9a-f-]+\/\?placed=1$/);

  expect(requests).toHaveLength(2);
  expect(requests[1]!.body).toEqual({
    deliveryMethod: 'courier',
    recipientName: 'Ион Попеску',
    phone: '069 123 456',
    address: 'ул. Пушкина 10, кв. 5',
  });
  // Сервер отказал до создания заказа, поэтому повтор идёт с новым ключом.
  expect(requests[0]!.key).toMatch(/^[0-9a-f-]{36}$/);
  expect(requests[1]!.key).toMatch(/^[0-9a-f-]{36}$/);
  expect(requests[1]!.key).not.toBe(requests[0]!.key);

  await expect(page.getByRole('status')).toContainText('Заказ оформлен');
  await expect(
    page.getByRole('heading', { name: 'Заказ B-1001' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Отменить заказ' }).click();
  await page.getByRole('button', { name: 'Да, отменить' }).click();
  await expect(page.getByText('Отменён').first()).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Отменить заказ' }),
  ).toHaveCount(0);
});

test('самовывоз: склад без всех товаров выбрать нельзя, в заказ уходит готовый склад', async ({
  page,
}) => {
  let body: Record<string, unknown> | undefined;
  await page.route(
    (url) => url.pathname === '/api/v1/orders',
    (route) => {
      body = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: placedOrder() });
    },
  );
  await page.route(
    (url) => url.pathname === `/api/v1/orders/${orderId}`,
    (route) => route.fulfill({ json: placedOrder() }),
  );
  await checkoutPage(page);

  await page.getByLabel('Самовывоз со склада').check();
  const warehouse = page.getByLabel('Склад', { exact: true });
  await expect(warehouse).toHaveValue(mainWarehouse);
  await expect(
    warehouse.locator('option', { hasText: 'Бельцы' }),
  ).toBeDisabled();
  await expect(page.getByLabel('Адрес', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Бесплатно')).toBeVisible();

  await page.getByLabel('Имя и фамилия').fill('Ион Попеску');
  await page.getByLabel('Телефон').fill('+373 69 123 456');
  await page.getByRole('button', { name: 'Подтвердить заказ' }).click();
  await expect(page).toHaveURL(/placed=1$/);
  expect(body).toEqual({
    deliveryMethod: 'pickup',
    recipientName: 'Ион Попеску',
    phone: '+373 69 123 456',
    warehouseId: mainWarehouse,
  });
});

test('нехватка товара при оформлении обновляет данные и объясняет, что случилось', async ({
  page,
}) => {
  await page.route(
    (url) => url.pathname === '/api/v1/orders',
    (route) => failure(route, 409, 'INVENTORY_NOT_AVAILABLE'),
  );
  await checkoutPage(page);
  await page.unroute((url) => url.pathname === '/api/v1/checkout');
  await page.route(
    (url) => url.pathname === '/api/v1/checkout',
    (route) =>
      route.fulfill({
        json: {
          ...checkout,
          cart: { items: [{ ...cartItem, available: 1 }] },
        },
      }),
  );
  await page.getByLabel('Адрес', { exact: true }).fill('ул. Пушкина 10, кв. 5');
  await page.getByLabel('Имя и фамилия').fill('Ион Попеску');
  await page.getByLabel('Телефон').fill('069123456');
  await page.getByRole('button', { name: 'Подтвердить заказ' }).click();
  await expect(page.getByText('Наличие изменилось')).toBeVisible();
  await expect(page.getByText('Доступно только 1')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Изменить корзину' }),
  ).toBeVisible();
});

test('список заказов ведёт к заказу; без входа страницы просят войти', async ({
  page,
}) => {
  await page.route(
    (url) => url.pathname === '/api/v1/orders',
    (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: orderId,
              number: 'B-1001',
              status: 'new',
              createdAt: '2026-11-18T13:20:00Z',
              deliveryMethod: 'post',
              itemsTotalMinor: 250100,
              deliveryPriceMinor: null,
              totalMinor: null,
              currency: 'MDL',
              quantity: 2,
            },
          ],
        },
      }),
  );
  await page.goto('http://127.0.0.1:4321/ru/orders/');
  const link = page.getByRole('link', { name: /Заказ B-1001/ });
  await expect(link).toContainText('Почтой');
  await expect(link).toContainText('+ доставка');
  await expect(link).toHaveAttribute('href', `/ru/orders/${orderId}/`);

  await page.route(
    (url) => url.pathname === '/api/v1/checkout',
    (route) => failure(route, 401, 'AUTH_REQUIRED'),
  );
  await page.goto('http://127.0.0.1:4321/ru/checkout/');
  await expect(
    page.getByText('Войдите в аккаунт, чтобы оформить заказ.'),
  ).toBeVisible();
});
