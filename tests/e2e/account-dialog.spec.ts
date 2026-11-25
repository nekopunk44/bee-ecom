import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const catalog = 'http://127.0.0.1:4321/ru/catalog/';
const guest = {
  status: 401,
  json: {
    error: { code: 'AUTH_REQUIRED', message: 'Sign in', requestId: 'test' },
  },
};

/** Без входа; Google подключён или нет — как скажет тест. */
async function api(page: Page, google: boolean) {
  await page.route('**/api/v1/auth/session', (route) => route.fulfill(guest));
  await page.route('**/api/v1/auth/providers', (route) =>
    route.fulfill({ json: { google } }),
  );
}
/** До загрузки скрипта шапки значок аккаунта ведёт на страницу аккаунта. */
async function ready(page: Page) {
  await expect(page.locator('html[data-account-dialog]')).toHaveCount(1);
}

test('the account icon opens sign-in over the page and keeps the page', async ({
  page,
}) => {
  await api(page, false);
  let sent: unknown;
  await page.route('**/api/v1/auth/login', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { email: 'buyer@example.test' } });
  });
  await page.goto(catalog);
  await ready(page);
  await page.getByRole('banner').getByRole('link', { name: 'Аккаунт' }).click();
  const dialog = page.getByRole('dialog', { name: 'Аккаунт' });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(catalog);
  // Google не подключён — кнопки нет.
  await expect(dialog.getByRole('link', { name: /Google/ })).toHaveCount(0);
  await dialog.getByLabel('Электронная почта').fill('buyer@example.test');
  await dialog.getByLabel('Пароль', { exact: true }).fill('very-long-password');
  await dialog.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Вы вошли', level: 2 }),
  ).toBeVisible();
  expect(sent).toEqual({
    email: 'buyer@example.test',
    password: 'very-long-password',
  });
  // Окно закрывается само, человек остаётся на той же странице.
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page).toHaveURL(catalog);
  await expect(
    page.getByRole('banner').getByRole('link', { name: 'Аккаунт' }),
  ).toHaveAttribute('data-signed-in', '');
});

test('registration explains a taken address and Google sends the person back here', async ({
  page,
}) => {
  await api(page, true);
  await page.route('**/api/v1/auth/register', (route) =>
    route.fulfill({
      status: 409,
      json: {
        error: { code: 'EMAIL_UNAVAILABLE', message: 'Taken', requestId: 't' },
      },
    }),
  );
  await page.goto(`${catalog}?category=hives`);
  await ready(page);
  await page.getByRole('banner').getByRole('link', { name: 'Аккаунт' }).click();
  const dialog = page.getByRole('dialog', { name: 'Аккаунт' });
  await expect(
    dialog.getByRole('link', { name: 'Войти через Google' }),
  ).toHaveAttribute(
    'href',
    '/api/v1/auth/google/start?return=%2Fru%2Fcatalog%2F%3Fcategory%3Dhives',
  );
  await dialog.getByRole('button', { name: 'Создать аккаунт' }).click();
  await expect(dialog.getByText('Не короче 12 символов')).toBeVisible();
  await dialog.getByLabel('Электронная почта').fill('taken@example.test');
  await dialog.getByLabel('Пароль', { exact: true }).fill('very-long-password');
  await dialog
    .getByRole('button', { name: 'Создать аккаунт', exact: true })
    .last()
    .click();
  await expect(dialog.getByRole('alert')).toContainText('уже зарегистрирован');
  // Глазок показывает пароль.
  await dialog.getByRole('button', { name: 'Показать пароль' }).click();
  await expect(dialog.getByLabel('Пароль', { exact: true })).toHaveAttribute(
    'type',
    'text',
  );
});

test('a failed Google sign-in reopens the window with an explanation', async ({
  page,
}) => {
  await api(page, true);
  await page.goto(`${catalog}?signin=google-failed`);
  const dialog = page.getByRole('dialog', { name: 'Аккаунт' });
  await expect(dialog.getByRole('alert')).toContainText(
    'Не получилось войти через Google',
  );
  await expect(page).toHaveURL(catalog);
});
