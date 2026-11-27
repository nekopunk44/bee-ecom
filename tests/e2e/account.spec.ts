import { expect, test } from '@playwright/test';

test('the old account address opens the window, where a customer registers and logs out', async ({
  page,
}) => {
  const customer = {
    email: 'buyer@example.test',
    password: 'customer-password-42',
  };
  let authenticated = false;
  await page.route('**/api/v1/auth/session', (route) =>
    authenticated
      ? route.fulfill({ json: { email: customer.email, permissions: [] } })
      : route.fulfill({
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
  await page.route('**/api/v1/auth/providers', (route) =>
    route.fulfill({ json: { google: false } }),
  );
  await page.route('**/api/v1/auth/register', async (route) => {
    expect(route.request().postDataJSON()).toEqual(customer);
    authenticated = true;
    await route.fulfill({
      status: 201,
      headers: {
        'set-cookie':
          'bee_session=test; Path=/api/v1; HttpOnly; SameSite=Strict',
      },
      json: { email: customer.email },
    });
  });
  await page.route('**/api/v1/auth/logout', async (route) => {
    authenticated = false;
    await route.fulfill({ status: 204 });
  });
  // Отдельной страницы аккаунта нет: старый адрес открывает окно на главной.
  await page.goto('http://127.0.0.1:4321/ru/account/');
  await expect(page).toHaveURL('http://127.0.0.1:4321/ru/');
  const dialog = page.getByRole('dialog', { name: 'Аккаунт' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Создать аккаунт' }).click();
  await dialog.getByLabel('Электронная почта').fill(customer.email);
  await dialog.getByLabel('Пароль', { exact: true }).fill(customer.password);
  await dialog
    .getByRole('button', { name: 'Создать аккаунт', exact: true })
    .last()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Вы вошли', level: 2 }),
  ).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  // Выход — из того же окна, через значок аккаунта.
  await page.getByRole('banner').getByRole('link', { name: 'Аккаунт' }).click();
  await page
    .getByRole('dialog', { name: 'Вы вошли' })
    .getByRole('button', { name: 'Выйти' })
    .click();
  await expect(dialog.getByLabel('Электронная почта')).toBeVisible();
});
