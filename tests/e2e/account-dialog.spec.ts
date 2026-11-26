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

test('the window flies back into the icon on Escape, the cross and the backdrop', async ({
  page,
}) => {
  await api(page, false);
  await page.goto(catalog);
  await ready(page);
  const icon = page.getByRole('banner').getByRole('link', { name: 'Аккаунт' });
  const open = page.locator('dialog[open]');
  await icon.click();
  // Сота вылетает из значка: в начале окно смещено к нему.
  await expect(open).toHaveCount(1);
  const offset = await open.evaluate((dialog: HTMLElement) =>
    Number.parseFloat(dialog.style.getPropertyValue('--cell-x')),
  );
  expect(offset).toBeGreaterThan(0);
  // Escape закрывает с анимацией: сначала окно сворачивается, потом исчезает.
  await page.keyboard.press('Escape');
  await expect(open).toHaveCount(0);
  await expect(icon).toHaveClass(/bump/);
  await icon.click();
  await page.getByRole('button', { name: 'Закрыть' }).click();
  await expect(open).toHaveCount(0);
  await icon.click();
  await expect(open).toHaveCount(1);
  await page.mouse.click(4, 4);
  await expect(open).toHaveCount(0);
});

test('the page under the open window stays put and fields focus softly', async ({
  page,
}) => {
  await api(page, false);
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto(catalog);
  await ready(page);
  const root = page.locator('html');
  await page.getByRole('banner').getByRole('link', { name: 'Аккаунт' }).click();
  const dialog = page.getByRole('dialog', { name: 'Аккаунт' });
  await expect(dialog).toBeVisible();
  await expect(root).toHaveCSS('overflow', 'hidden');
  await page.mouse.move(20, 500);
  await page.mouse.wheel(0, 800);
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );
  expect(await page.evaluate(() => scrollY)).toBe(0);
  // Поле в фокусе без толстой обводки: только рамка и мягкий ореол.
  const email = dialog.getByLabel('Электронная почта');
  await email.click();
  await expect(email).toHaveCSS('outline-style', 'none');
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(root).not.toHaveCSS('overflow', 'hidden');
  await page.mouse.wheel(0, 800);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
});
