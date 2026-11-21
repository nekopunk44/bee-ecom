import { expect, test } from '@playwright/test';

const ORDER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORDER_NUMBER = 'BEE-2026-001';
const CREATED_AT = '2026-11-18T10:00:00.000Z';

/** Minimal AdminOrderSummary item for the list response. */
const summary = {
  id: ORDER_ID,
  number: ORDER_NUMBER,
  status: 'new',
  createdAt: CREATED_AT,
  deliveryMethod: 'courier',
  recipientName: 'Иван Иванов',
  phone: '+373600000001',
  itemsTotalMinor: 25000,
  deliveryPriceMinor: null,
  totalMinor: null,
  currency: 'MDL',
  quantity: 1,
};

/** Full Order object (shape: Order schema). */
function makeOrder(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    number: ORDER_NUMBER,
    status,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    deliveryMethod: 'courier',
    warehouse: null,
    recipientName: 'Иван Иванов',
    phone: '+373600000001',
    locality: 'Кишинёв',
    address: 'ул. Пушкина, 1',
    postalCode: '2001',
    comment: null,
    itemsTotalMinor: 25000,
    deliveryPriceMinor: null,
    totalMinor: null,
    currency: 'MDL',
    paymentMethod: 'on_delivery',
    trackingNumber: null,
    items: [
      {
        variantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        productSlug: 'uley-dadan',
        sku: 'DADAN-10',
        name: 'Улей Дадан 10 рамок',
        variantName: '10 рамок',
        unitPriceMinor: 25000,
        quantity: 1,
      },
    ],
    history: [{ status: 'new', at: CREATED_AT }],
    ...extra,
  };
}

/** Counts map used in AdminOrderList. */
function makeCounts(newCount = 1) {
  return {
    new: newCount,
    confirmed: 0,
    ready: 0,
    shipped: 0,
    completed: 0,
    cancelled: 0,
  };
}

/** Route the session mock with the given permissions. */
async function routeSession(
  page: import('@playwright/test').Page,
  permissions: string[],
) {
  await page.route('**/api/v1/auth/session', (route) =>
    route.fulfill({
      json: { email: 'manager@example.test', permissions },
    }),
  );
}

test('courier order progresses from new to shipped', async ({ page }) => {
  await routeSession(page, ['orders.read', 'orders.manage']);

  // --- orders list ---
  await page.route('**/api/v1/admin/orders*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/status')) {
      // handled by status route below — should not reach here
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        items: [{ ...summary }],
        total: 1,
        counts: makeCounts(1),
      },
    });
  });

  // --- order detail ---
  let orderState = makeOrder('new');
  let orderDetailCalls = 0;
  await page.route(`**/api/v1/admin/orders/${ORDER_ID}`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    orderDetailCalls++;
    await route.fulfill({ json: orderState });
  });

  // --- status changes ---
  await page.route(
    `**/api/v1/admin/orders/${ORDER_ID}/status`,
    async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const to = body.to as string;
      orderState = makeOrder(to, {
        deliveryPriceMinor:
          body.deliveryPriceMinor ?? orderState.deliveryPriceMinor,
        trackingNumber:
          (body.trackingNumber as string) ?? orderState.trackingNumber,
        totalMinor:
          to === 'confirmed'
            ? (orderState.itemsTotalMinor as number) +
              ((body.deliveryPriceMinor as number) ?? 0)
            : orderState.totalMinor,
      });
      await route.fulfill({ json: orderState });
    },
  );

  await page.goto('http://127.0.0.1:4173');

  // The user has no products.read → workspace opens on «Заказы» tab
  await expect(page.getByRole('button', { name: 'Заказы' })).toBeVisible();

  // «Новые» filter shows count 1
  await expect(
    page.getByRole('button', { name: /Новые/ }).getByText('1'),
  ).toBeVisible();

  // The order number appears in the table
  await expect(page.getByText(ORDER_NUMBER)).toBeVisible();

  // Open the order
  await page.getByRole('button', { name: 'Открыть' }).click();
  await expect(page.getByText(`Заказ ${ORDER_NUMBER}`)).toBeVisible();

  // --- new → confirmed: type delivery price and click «Подтвердить» ---
  await page.getByLabel('Цена доставки, леев').fill('45,50');
  const statusPromise = page.waitForRequest(
    (req) => req.url().includes('/status') && req.method() === 'POST',
  );
  await page.getByRole('button', { name: 'Подтвердить' }).click();
  const confirmReq = await statusPromise;
  expect(confirmReq.postDataJSON()).toEqual({
    from: 'new',
    to: 'confirmed',
    deliveryPriceMinor: 4550,
  });

  // After confirming, the «Собран» button appears
  await expect(
    page.getByRole('button', { name: 'Собран', exact: true }),
  ).toBeVisible();

  // --- confirmed → ready ---
  const readyPromise = page.waitForRequest(
    (req) => req.url().includes('/status') && req.method() === 'POST',
  );
  await page.getByRole('button', { name: 'Собран', exact: true }).click();
  const readyReq = await readyPromise;
  expect(readyReq.postDataJSON()).toEqual({ from: 'confirmed', to: 'ready' });

  // Tracking field should appear (non-pickup courier order)
  await expect(page.getByLabel(/Трек-номер/)).toBeVisible();

  // --- ready → shipped ---
  await page.getByLabel(/Трек-номер/).fill('RR123MD');
  const shippedPromise = page.waitForRequest(
    (req) => req.url().includes('/status') && req.method() === 'POST',
  );
  await page.getByRole('button', { name: 'Отправлен', exact: true }).click();
  const shippedReq = await shippedPromise;
  expect(shippedReq.postDataJSON()).toEqual({
    from: 'ready',
    to: 'shipped',
    trackingNumber: 'RR123MD',
  });
});

test('stale order: 409 shows alert and re-fetches order', async ({ page }) => {
  await routeSession(page, ['orders.read', 'orders.manage']);

  await page.route('**/api/v1/admin/orders*', async (route) => {
    const url = new URL(route.request().url());
    if (
      url.pathname.includes('/status') ||
      url.pathname.match(/\/orders\/[^/]+$/)
    ) {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: { items: [{ ...summary }], total: 1, counts: makeCounts(1) },
    });
  });

  let detailCallCount = 0;
  await page.route(`**/api/v1/admin/orders/${ORDER_ID}`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    detailCallCount++;
    await route.fulfill({ json: makeOrder('new') });
  });

  await page.route(
    `**/api/v1/admin/orders/${ORDER_ID}/status`,
    async (route) => {
      await route.fulfill({
        status: 409,
        json: {
          error: {
            code: 'ORDER_STATUS_CHANGED',
            message: 'The order status was changed by another operator.',
            requestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          },
        },
      });
    },
  );

  await page.goto('http://127.0.0.1:4173');
  await page.getByRole('button', { name: 'Открыть' }).click();
  await expect(page.getByText(`Заказ ${ORDER_NUMBER}`)).toBeVisible();

  const callsBefore = detailCallCount;
  await page.getByRole('button', { name: 'Подтвердить' }).click();

  // Alert text starts with «Заказ уже изменил другой сотрудник»
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: /Заказ уже изменил другой сотрудник/ }),
  ).toBeVisible();

  // The detail endpoint is called again after the 409
  expect(detailCallCount).toBeGreaterThan(callsBefore);
});

test('cancellation requires confirmation', async ({ page }) => {
  await routeSession(page, ['orders.read', 'orders.manage']);

  await page.route('**/api/v1/admin/orders*', async (route) => {
    const url = new URL(route.request().url());
    if (
      url.pathname.includes('/status') ||
      url.pathname.match(/\/orders\/[^/]+$/)
    ) {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: { items: [{ ...summary }], total: 1, counts: makeCounts(1) },
    });
  });

  await page.route(`**/api/v1/admin/orders/${ORDER_ID}`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({ json: makeOrder('new') });
  });

  let cancelCalls = 0;
  await page.route(
    `**/api/v1/admin/orders/${ORDER_ID}/status`,
    async (route) => {
      cancelCalls++;
      await route.fulfill({ json: makeOrder('cancelled') });
    },
  );

  await page.goto('http://127.0.0.1:4173');
  await page.getByRole('button', { name: 'Открыть' }).click();
  await expect(page.getByText(`Заказ ${ORDER_NUMBER}`)).toBeVisible();

  // First click shows the confirmation button, does NOT call the API
  await page.getByRole('button', { name: 'Отменить заказ' }).click();
  expect(cancelCalls).toBe(0);
  await expect(
    page.getByRole('button', { name: 'Да, отменить' }),
  ).toBeVisible();

  // Second click sends { from: 'new', to: 'cancelled' }
  const cancelPromise = page.waitForRequest(
    (req) => req.url().includes('/status') && req.method() === 'POST',
  );
  await page.getByRole('button', { name: 'Да, отменить' }).click();
  const cancelReq = await cancelPromise;
  expect(cancelReq.postDataJSON()).toEqual({ from: 'new', to: 'cancelled' });
});

test('orders.read-only: order is visible but action buttons are absent', async ({
  page,
}) => {
  await routeSession(page, ['orders.read']);

  await page.route('**/api/v1/admin/orders*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.match(/\/orders\/[^/]+$/)) {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: { items: [{ ...summary }], total: 1, counts: makeCounts(1) },
    });
  });

  await page.route(`**/api/v1/admin/orders/${ORDER_ID}`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({ json: makeOrder('new') });
  });

  await page.goto('http://127.0.0.1:4173');
  await page.getByRole('button', { name: 'Открыть' }).click();
  await expect(page.getByText(`Заказ ${ORDER_NUMBER}`)).toBeVisible();

  // Order details are visible
  await expect(
    page.getByRole('article').getByText('Иван Иванов'),
  ).toBeVisible();

  // Action buttons must NOT exist
  await expect(
    page.getByRole('button', { name: 'Подтвердить' }),
  ).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Отменить заказ' }),
  ).not.toBeVisible();
});
