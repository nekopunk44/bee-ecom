import { expect, test } from '@playwright/test';

test('customer can register, start an HttpOnly session and log out from storefront', async ({
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
  await page.goto('http://127.0.0.1:4321/ru/account/');
  await page.getByRole('button', { name: 'Создать аккаунт' }).click();
  await page.getByLabel('Электронная почта').fill(customer.email);
  await page.getByLabel('Пароль').fill(customer.password);
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await expect(page.getByText(customer.email)).toBeVisible();
  await page.getByRole('button', { name: 'Выйти' }).click();
  await expect(page.locator('form')).toBeVisible();
});
