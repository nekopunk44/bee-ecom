import { expect, test } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/auth/session', (route) =>
    route.fulfill({
      status: 401,
      json: {
        error: { code: 'AUTH_REQUIRED', message: 'Sign in', requestId: 'test' },
      },
    }),
  );
});

test('storefront remains usable without JavaScript and shares locale routes', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4321/');
  await expect(page).toHaveURL(/\/ru\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Хорошая пасека',
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await page.getByRole('link', { name: 'RO', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'O stupină bună',
  );
  await expect(page.locator('script')).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('storefront-desktop.png'),
    fullPage: true,
  });
  await context.close();
});

test('mobile layout fits and keyboard skip link reaches main', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('http://127.0.0.1:4321/ru/');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Перейти к содержимому' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
  await page.screenshot({
    path: testInfo.outputPath('storefront-mobile.png'),
    fullPage: true,
  });
});

test('unknown public route returns a real 404', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:4321/missing/path');
  expect(response.status()).toBe(404);
});

test('admin reports API success using the generated contract', async ({
  page,
}) => {
  await page.route('**/api/v1/health/ready', (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: { 'X-Request-Id': 'd49aed44-9cbd-4241-a783-dd63c82cc146' },
      body: JSON.stringify({
        status: 'ready',
        checks: { postgres: 'up', redis: 'up' },
      }),
    }),
  );
  await page.goto('http://127.0.0.1:4173');
  await page.getByText('Проверка подключения', { exact: true }).click();
  await page.getByRole('button', { name: 'Проверить подключение' }).click();
  await expect(page.getByRole('status')).toContainText(
    'PostgreSQL и Redis доступны',
  );
  await expect(page.getByText('Код запроса:')).toContainText('d49aed44');
});

test('admin handles dependency failure and permits retry', async ({ page }) => {
  await page.route('**/api/v1/health/ready', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'DEPENDENCY_UNAVAILABLE',
          message: 'Service is not ready',
          requestId: 'd49aed44-9cbd-4241-a783-dd63c82cc146',
        },
      }),
    }),
  );
  await page.goto('http://127.0.0.1:4173');
  await page.getByText('Проверка подключения', { exact: true }).click();
  await page.getByRole('button', { name: 'Проверить подключение' }).click();
  await expect(page.getByRole('status')).toContainText('API пока не готово');
  await expect(
    page.getByRole('button', { name: 'Проверить подключение' }),
  ).toBeEnabled();
});

test('admin handles network loss without an unhandled exception', async ({
  page,
}) => {
  await page.route('**/api/v1/health/ready', (route) => route.abort());
  await page.goto('http://127.0.0.1:4173');
  await page.getByText('Проверка подключения', { exact: true }).click();
  await page.getByRole('button', { name: 'Проверить подключение' }).click();
  await expect(page.getByRole('status')).toContainText('Не удалось связаться');
});
