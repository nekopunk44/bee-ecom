import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

// Run only against the disposable development/CI stack: creates an admin and product.
const origin = 'http://admin.localhost:8080';
const base = process.env.SMOKE_BASE_URL ?? 'http://localhost:8080';
const suffix = randomUUID();
const credentials = {
  email: `ci-${suffix}@example.invalid`,
  password: randomUUID(),
};
execFileSync('docker', ['compose', 'exec', '-T', 'api', 'bee-admin-create'], {
  input: JSON.stringify(credentials) + '\n',
  stdio: ['pipe', 'pipe', 'pipe'],
});
let cookie = '';
async function request(path, status, method = 'GET', body, extra = {}) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      Host: 'admin.localhost',
      Origin: origin,
      Cookie: cookie,
      'Content-Type': 'application/json',
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(
    response.status,
    status,
    `${method} ${path}: ${await response.clone().text()}`,
  );
  return response;
}
async function mediaRequest(path, status, extra = {}) {
  const response = await fetch(`${base}${path}`, {
    headers: { Host: 'admin.localhost', ...extra },
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(
    response.status,
    status,
    `GET ${path}: ${await response.clone().text()}`,
  );
  return response;
}
await request('/admin/products', 401);
await request('/auth/login', 403, 'POST', credentials, {
  Origin: 'https://untrusted.invalid',
});
const login = await request('/auth/login', 200, 'POST', credentials);
const setCookie = login.headers.get('set-cookie');
assert.match(setCookie, /HttpOnly/i);
assert.match(setCookie, /SameSite=Strict/i);
cookie = setCookie.split(';')[0];
const session = await (await request('/auth/session', 200)).json();
assert.ok(session.permissions.includes('products.write'));
assert.ok(session.permissions.includes('inventory.adjust'));
assert.ok(session.permissions.includes('warehouses.manage'));

const customer = {
  email: `shopper-${suffix}@example.invalid`,
  password: `customer-${randomUUID()}-long`,
};
const storefrontOrigin = { Host: 'localhost', Origin: 'http://localhost:8080' };
await request('/auth/register', 403, 'POST', customer, {
  ...storefrontOrigin,
  Origin: 'https://untrusted.invalid',
});
await request(
  '/auth/register',
  422,
  'POST',
  {
    email: customer.email,
    password: 'short',
  },
  storefrontOrigin,
);
const registration = await request(
  '/auth/register',
  201,
  'POST',
  customer,
  storefrontOrigin,
);
const customerCookie = registration.headers.get('set-cookie');
assert.match(customerCookie, /HttpOnly/i);
assert.match(customerCookie, /SameSite=Strict/i);
const customerSession = await (
  await request('/auth/session', 200, 'GET', undefined, {
    Cookie: customerCookie.split(';')[0],
  })
).json();
assert.equal(customerSession.email, customer.email);
assert.deepEqual(customerSession.permissions, []);
await request('/auth/register', 409, 'POST', customer, storefrontOrigin);
const customerLogin = await request(
  '/auth/login',
  200,
  'POST',
  customer,
  storefrontOrigin,
);
const customerLoginCookie = customerLogin.headers
  .get('set-cookie')
  .split(';')[0];
await request('/auth/logout', 204, 'POST', undefined, {
  ...storefrontOrigin,
  Cookie: customerLoginCookie,
});
await request('/auth/session', 401, 'GET', undefined, {
  Cookie: customerLoginCookie,
});
const mediaHeaders = {
  Host: 'admin.localhost',
  Origin: origin,
  Cookie: cookie,
  'Content-Type': 'application/octet-stream',
};
const invalidImage = await fetch(`${base}/api/v1/admin/media`, {
  method: 'POST',
  headers: mediaHeaders,
  body: '<svg/>',
  signal: AbortSignal.timeout(20000),
});
assert.equal(invalidImage.status, 415);
const imageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=',
  'base64',
);
const upload = await fetch(`${base}/api/v1/admin/media`, {
  method: 'POST',
  headers: mediaHeaders,
  body: imageBytes,
  signal: AbortSignal.timeout(60000),
});
assert.equal(upload.status, 201, await upload.clone().text());
const media = await upload.json();
await mediaRequest(media.url, 401, { Cookie: '' });
const category = await (
  await request('/admin/categories', 201, 'POST', {
    slug: `ci-${suffix}`,
    nameRu: 'Проверка',
    nameRo: 'Verificare',
  })
).json();
const translation = {
  name: `CI ${suffix}`,
  description: 'Integration verification',
  seoTitle: '',
  seoDescription: '',
};
const draft = {
  slug: `ci-${suffix}`,
  status: 'draft',
  brandId: null,
  categoryIds: [category.id],
  mediaIds: [media.id],
  translations: { ru: translation, ro: translation },
  variants: [
    {
      sku: `CI-${suffix}`,
      name: 'Test',
      priceMinor: 12345,
      active: true,
      attributes: {},
    },
  ],
};
const created = await (
  await request('/admin/products', 201, 'POST', draft)
).json();
assert.equal(created.revision, 1);
// Updates must send the persisted variant ID; replacing SKU on a new ID is rejected.
draft.variants[0].id = created.variants[0].id;
await request(`/products/${draft.slug}`, 404);
const published = await (
  await request(`/admin/products/${created.id}`, 200, 'PUT', {
    ...draft,
    status: 'active',
    revision: 1,
  })
).json();
assert.equal(published.revision, 2);
await request(`/admin/products/${created.id}`, 409, 'PUT', {
  ...draft,
  revision: 1,
});
const product = await (await request(`/products/${draft.slug}`, 200)).json();
assert.equal(product.variants[0].priceMinor, 12345);
// Lists go through Drogon's binary parameters, which the PGlite tests do not use.
const listed = await (
  await request(`/products?locale=ru&q=${encodeURIComponent(suffix)}`, 200)
).json();
assert.deepEqual(
  listed.items.map((item) => item.id),
  [created.id],
);
const adminList = await (
  await request('/admin/products?locale=ru&page=1&limit=12', 200)
).json();
assert.ok(adminList.items.some((item) => item.id === created.id));
const warehouse = await (
  await request('/admin/warehouses', 201, 'POST', {
    code: `ci-${suffix}`,
    name: `CI warehouse ${suffix}`,
  })
).json();
assert.equal(warehouse.active, true);
const adjustment = {
  warehouseId: warehouse.id,
  variantId: published.variants[0].id,
  delta: 3,
  reason: 'CI stock receipt',
};
const adjustmentKey = randomUUID();
const adjusted = await (
  await request('/admin/inventory/adjustments', 200, 'POST', adjustment, {
    'Idempotency-Key': adjustmentKey,
  })
).json();
assert.deepEqual(adjusted, { onHand: 3, reserved: 0, replayed: false });
const replayed = await (
  await request('/admin/inventory/adjustments', 200, 'POST', adjustment, {
    'Idempotency-Key': adjustmentKey,
  })
).json();
assert.deepEqual(replayed, { onHand: 3, reserved: 0, replayed: true });
const warehouseList = await (await request('/admin/warehouses', 200)).json();
assert.ok(warehouseList.some((item) => item.id === warehouse.id));
const availability = await (
  await request(`/inventory/products/${published.variants[0].id}`, 200)
).json();
assert.equal(availability.available, 3);
assert.equal(availability.warehouses[0].code, warehouse.code);
const storefront = {
  Host: 'localhost',
  Origin: 'http://localhost:8080',
  Cookie: customerCookie.split(';')[0],
};
const emptyCart = await (
  await request('/cart?locale=ru', 200, 'GET', undefined, storefront)
).json();
assert.deepEqual(emptyCart, { items: [] });
const updatedCart = await (
  await request(
    '/cart/items?locale=ru',
    200,
    'POST',
    { variantId: published.variants[0].id, quantity: 2 },
    storefront,
  )
).json();
assert.equal(updatedCart.items.length, 1);
assert.equal(updatedCart.items[0].quantity, 2);
assert.equal(updatedCart.items[0].unitPriceMinor, 12345);
assert.equal(updatedCart.items[0].available, 3);
const ownCart = await (
  await request('/cart?locale=ro', 200, 'GET', undefined, storefront)
).json();
assert.equal(ownCart.items[0].name, translation.name);
await request(
  `/cart/items/${published.variants[0].id}?locale=ru`,
  200,
  'DELETE',
  undefined,
  storefront,
);
assert.deepEqual(
  await (
    await request('/cart?locale=ru', 200, 'GET', undefined, storefront)
  ).json(),
  { items: [] },
);
// Покупатель вошёл, но прав на управление каталогом у него нет: 403, а не 401.
const customerOnAdmin = await request(
  '/admin/products',
  403,
  'GET',
  undefined,
  storefront,
);
assert.equal((await customerOnAdmin.json()).error.code, 'FORBIDDEN');
const conflict = await request(
  '/admin/inventory/adjustments',
  409,
  'POST',
  {
    ...adjustment,
    delta: 4,
  },
  { 'Idempotency-Key': adjustmentKey },
);
assert.equal((await conflict.json()).error.code, 'IDEMPOTENCY_CONFLICT');
const insufficient = await request(
  '/admin/inventory/adjustments',
  409,
  'POST',
  {
    ...adjustment,
    delta: -4,
    reason: 'CI oversell guard',
  },
  { 'Idempotency-Key': randomUUID() },
);
assert.equal((await insufficient.json()).error.code, 'BELOW_RESERVED');
const publicImage = await mediaRequest(media.url, 200, { Cookie: '' });
assert.equal(publicImage.headers.get('content-type'), 'image/webp');
const webp = Buffer.from(await publicImage.arrayBuffer());
assert.equal(webp.toString('ascii', 0, 4), 'RIFF');
assert.equal(webp.toString('ascii', 8, 12), 'WEBP');
for (const locale of ['ru', 'ro']) {
  const page = await fetch(`${base}/${locale}/catalog/${draft.slug}`);
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes(translation.name));
}
await request(`/admin/products/${created.id}`, 200, 'PUT', {
  ...draft,
  status: 'archived',
  revision: 2,
});
await request(`/products/${draft.slug}`, 404);
await mediaRequest(media.url, 401, { Cookie: '' });
execFileSync(
  'docker',
  [
    'compose',
    'exec',
    '-T',
    'postgres',
    'sh',
    '-c',
    'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
  ],
  {
    // Отзываем роли, но сессию и пользователя оставляем: следующие запросы должны получить 403 по живой
    // сессии. Удалить пользователя всё равно нельзя — на него ссылаются загруженные им медиа.
    input: `DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email IN ('${credentials.email}','${customer.email}'));\n`,
    stdio: ['pipe', 'pipe', 'pipe'],
  },
);
await request('/admin/products', 403);
await request('/admin/products', 403, 'POST', draft);
await request('/admin/warehouses', 403);
await request('/admin/inventory/adjustments', 403, 'POST', adjustment, {
  'Idempotency-Key': randomUUID(),
});
await request('/auth/logout', 204, 'POST');
await request('/auth/session', 401);
console.log(
  'Auth, catalog and inventory integration passed: customer registration/login/logout and origin checks, staff provisioning and role revocation, media processing/privacy, publication, warehouse creation, stock adjustment/replay/availability, oversell guard, revision conflict and SSR.',
);
