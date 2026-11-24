// Fills a demo stand with the catalog from infra/demo: categories, products with
// pictures, warehouses and stock. Safe to run again: existing categories, products
// and warehouses are kept, stock is only received for products created now, and an
// existing product without pictures gets its category picture.
//
//   DEMO_ADMIN_EMAIL=... DEMO_ADMIN_PASSWORD=... npm run demo:seed
//   (or put both into .env.local; DEMO_ADMIN_URL defaults to the Vercel admin)
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { brands, categories, products, warehouses } from '../demo/catalog.mjs';

const origin = (
  process.env.DEMO_ADMIN_URL ?? 'https://bee-ecom-admin.vercel.app'
).replace(/\/$/, '');
const email = process.env.DEMO_ADMIN_EMAIL;
const password = process.env.DEMO_ADMIN_PASSWORD;
if (!email || !password) {
  console.error(
    'Set DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD (for example in .env.local).',
  );
  process.exit(1);
}

let cookie = '';
async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const raw = body instanceof Buffer;
  const response = await fetch(`${origin}/api/v1${path}`, {
    method,
    headers: {
      Origin: origin,
      Cookie: cookie,
      'Content-Type': raw ? 'application/octet-stream' : 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    // The free Render API sleeps when idle; the first request wakes it up.
    signal: AbortSignal.timeout(120000),
  });
  const text = await response.text();
  return {
    status: response.status,
    data: text ? JSON.parse(text) : null,
    headers: response.headers,
  };
}

async function must(path, options, expected = [200, 201]) {
  const result = await api(path, options);
  if (!expected.includes(result.status)) {
    throw new Error(
      `${options?.method ?? 'GET'} ${path}: ${result.status} ${JSON.stringify(result.data)}`,
    );
  }
  return result.data;
}

const login = await api('/auth/login', {
  method: 'POST',
  body: { email, password },
});
if (login.status !== 200)
  throw new Error(
    `Login failed: ${login.status} ${JSON.stringify(login.data)}`,
  );
cookie = login.headers.get('set-cookie').split(';')[0];
console.log(`Signed in to ${origin}.`);

const metadata = await must('/catalog/metadata?locale=ru');
const categoryIds = new Map(
  metadata.categories.map((category) => [category.slug, category.id]),
);
const brandIds = new Map(
  metadata.brands.map((brand) => [brand.slug, brand.id]),
);
for (const brand of brands) {
  if (brandIds.has(brand.slug)) continue;
  const created = await must('/admin/brands', {
    method: 'POST',
    body: { slug: brand.slug, name: brand.name },
  });
  brandIds.set(brand.slug, created.id);
  console.log(`Brand ${brand.slug} created`);
}
for (const category of categories) {
  if (categoryIds.has(category.slug)) continue;
  const created = await must('/admin/categories', {
    method: 'POST',
    body: {
      slug: category.slug,
      nameRu: category.nameRu,
      nameRo: category.nameRo,
    },
  });
  categoryIds.set(category.slug, created.id);
  console.log(`Category ${category.slug}`);
}

const warehouseIds = new Map(
  (await must('/admin/warehouses')).map((warehouse) => [
    warehouse.code,
    warehouse.id,
  ]),
);
for (const warehouse of warehouses) {
  if (warehouseIds.has(warehouse.code)) continue;
  const created = await must('/admin/warehouses', {
    method: 'POST',
    body: warehouse,
  });
  warehouseIds.set(warehouse.code, created.id);
  console.log(`Warehouse ${warehouse.code}`);
}

// One uploaded picture per category kind, reused by its products.
const pictures = new Map();
async function picture(kind) {
  if (!pictures.has(kind)) {
    const bytes = await readFile(
      new URL(`../demo/images/${kind}.jpg`, import.meta.url),
    );
    const result = await api('/admin/media', { method: 'POST', body: bytes });
    if (result.status !== 201) {
      console.warn(
        `Picture ${kind} was not uploaded (${result.status}); products stay without it.`,
      );
    }
    pictures.set(kind, result.status === 201 ? result.data.id : null);
  }
  return pictures.get(kind);
}

// A product created while picture uploads failed gets its picture on a later run.
async function attachPicture(id, product) {
  const category = categories.find((item) => item.slug === product.category);
  const media = await picture(category.image);
  if (!media) {
    console.log(
      `Product ${product.slug} already exists, still without a picture`,
    );
    return;
  }
  const current = await must(`/admin/products/${id}`);
  await must(`/admin/products/${id}`, {
    method: 'PUT',
    body: {
      slug: current.slug,
      status: current.status,
      brandId: current.brandId,
      categoryIds: current.categoryIds,
      translations: current.translations,
      variants: current.variants.map(
        ({ id, sku, name, priceMinor, active, attributes }) => ({
          id,
          sku,
          name,
          priceMinor,
          active,
          attributes,
        }),
      ),
      mediaIds: [...current.images.map((image) => image.id), media],
      revision: current.revision,
    },
  });
  console.log(`Product ${product.slug} got its picture`);
}

for (const product of products) {
  const existing = await api(`/products/${product.slug}?locale=ru`);
  if (existing.status === 200) {
    if (existing.data.images.length === 0)
      await attachPicture(existing.data.id, product);
    else console.log(`Product ${product.slug} already exists`);
    continue;
  }
  const category = categories.find((item) => item.slug === product.category);
  const media = await picture(category.image);
  const created = await must('/admin/products', {
    method: 'POST',
    body: {
      slug: product.slug,
      status: 'active',
      brandId: brandIds.get(product.brand) ?? null,
      categoryIds: [categoryIds.get(product.category)],
      mediaIds: media ? [media] : [],
      translations: { ru: product.ru, ro: product.ro },
      variants: product.variants.map(({ sku, name, priceMinor }) => ({
        sku,
        name,
        priceMinor,
        active: true,
        attributes: {},
      })),
    },
  });
  for (const variant of product.variants) {
    const variantId = created.variants.find(
      (item) => item.sku === variant.sku,
    )?.id;
    for (const [code, quantity] of Object.entries(variant.stock)) {
      if (!quantity || !variantId) continue;
      await must('/admin/inventory/adjustments', {
        method: 'POST',
        headers: { 'Idempotency-Key': randomUUID() },
        body: {
          warehouseId: warehouseIds.get(code),
          variantId,
          delta: quantity,
          reason: 'Demo stock receipt',
        },
      });
    }
  }
  console.log(`Product ${product.slug} (${created.status})`);
}

await api('/auth/logout', { method: 'POST' });
console.log('Done.');
