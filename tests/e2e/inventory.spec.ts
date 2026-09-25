import { expect, test } from '@playwright/test';
import { product, metadata } from '../fixtures/catalog.mjs';

test('warehouse manager creates a warehouse and applies a stock adjustment', async ({
  page,
}) => {
  await page.route('**/api/v1/auth/session', (route) =>
    route.fulfill({
      json: {
        email: 'warehouse@example.test',
        permissions: [
          'inventory.read',
          'inventory.adjust',
          'warehouses.manage',
        ],
      },
    }),
  );
  let catalogAdminCalls = 0;
  await page.route('**/api/v1/admin/products*', (route) => {
    catalogAdminCalls++;
    return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 12 } });
  });
  await page.route('**/api/v1/catalog/metadata*', (route) =>
    route.fulfill({ json: metadata }),
  );
  await page.route('**/api/v1/products?*', (route) =>
    route.fulfill({ json: { items: [product], total: 1, page: 1, limit: 48 } }),
  );
  let warehouses: {
    id: string;
    code: string;
    name: string;
    active: boolean;
  }[] = [];
  await page.route('**/api/v1/admin/warehouses', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      const created = {
        id: '55555555-5555-4555-8555-555555555555',
        ...body,
        active: true,
      };
      warehouses = [created];
      await route.fulfill({ status: 201, json: created });
      return;
    }
    await route.fulfill({ json: warehouses });
  });
  let adjustmentCount = 0;
  await page.route('**/api/v1/admin/inventory/adjustments', async (route) => {
    expect(route.request().headers()['idempotency-key']).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
    expect(route.request().postDataJSON().warehouseId).toBe(
      warehouses.at(0)?.id,
    );
    adjustmentCount++;
    await route.fulfill({ json: { onHand: 4, reserved: 0, replayed: false } });
  });

  await page.goto('http://127.0.0.1:4173');
  await page.getByRole('button', { name: 'Склады и остатки' }).click();
  await page.getByLabel('Код').fill('main');
  await page.getByLabel('Название').fill('Главный склад');
  await page.getByRole('button', { name: 'Создать склад' }).click();
  await expect(page.getByText('Склад создан.')).toBeVisible();
  await page.getByLabel('Причина').fill('Приёмка товара');
  await page.getByRole('button', { name: 'Применить изменение' }).click();
  await expect(page.getByText('Остаток обновлён.')).toBeVisible();
  await expect(
    page.getByText('После изменения: на складе 4, зарезервировано 0.'),
  ).toBeVisible();
  expect(adjustmentCount).toBe(1);
  expect(catalogAdminCalls).toBe(0);
});
