// Replaces the category pictures of demo products with freely licensed photos from
// Wikimedia Commons, listed with their authors and licences in
// apps/storefront/src/data/demo-photos.json (the storefront credits them).
// Run it once per stand, after demo:seed: every run uploads the photos again.
//
//   DEMO_ADMIN_EMAIL=... DEMO_ADMIN_PASSWORD=... npm run demo:photos
import photos from '../../apps/storefront/src/data/demo-photos.json' with { type: 'json' };

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
// Wikimedia asks automated clients to name themselves.
const userAgent = 'BeeDemoCatalog/1.0 (https://github.com/nekopunk44/bee-ecom)';

let cookie = '';
async function api(path, { method = 'GET', body } = {}) {
  const raw = body instanceof Buffer;
  const response = await fetch(`${origin}/api/v1${path}`, {
    method,
    headers: {
      Origin: origin,
      Cookie: cookie,
      'Content-Type': raw ? 'application/octet-stream' : 'application/json',
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
  if (!expected.includes(result.status))
    throw new Error(
      `${options?.method ?? 'GET'} ${path}: ${result.status} ${JSON.stringify(result.data)}`,
    );
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
cookie = login.headers
  .getSetCookie()
  .map((value) => value.split(';')[0])
  .join('; ');
console.log(`Signed in to ${origin}.`);

for (const [slug, list] of Object.entries(photos)) {
  const product = await api(`/products/${slug}`);
  if (product.status !== 200) {
    console.log(`Product ${slug} is not on this stand, skipped`);
    continue;
  }
  const mediaIds = [];
  for (const photo of list) {
    const image = await fetch(photo.image, {
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(60000),
    });
    if (!image.ok) {
      console.warn(`${photo.title}: download failed (${image.status})`);
      continue;
    }
    const uploaded = await must('/admin/media', {
      method: 'POST',
      body: Buffer.from(await image.arrayBuffer()),
    });
    mediaIds.push(uploaded.id);
  }
  if (mediaIds.length === 0) continue;
  const current = await must(`/admin/products/${product.data.id}`);
  await must(`/admin/products/${product.data.id}`, {
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
      mediaIds,
      revision: current.revision,
    },
  });
  console.log(`Product ${slug}: ${mediaIds.length} photo(s)`);
}
console.log('Done.');
