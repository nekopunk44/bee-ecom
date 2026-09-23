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
execFileSync(
  'docker',
  ['compose', 'exec', '-T', 'api', 'bee-admin-create'],
  {
    input: JSON.stringify(credentials) + '\n',
    stdio: ['pipe', 'pipe', 'pipe'],
  },
);
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
  mediaIds: [],
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
await request('/auth/logout', 204, 'POST');
await request('/auth/session', 401);
console.log(
  'Catalog integration passed: provisioning, origin, session, draft/publication, revision conflict, SSR and logout.',
);
