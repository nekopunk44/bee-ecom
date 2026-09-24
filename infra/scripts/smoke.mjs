import assert from 'node:assert/strict';

const base = process.env.SMOKE_BASE_URL ?? 'http://localhost:8080';
const adminHost = process.env.ADMIN_HOST ?? 'admin.localhost';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const request = (path, options = {}) =>
  fetch(`${base}${path}`, { ...options, signal: AbortSignal.timeout(10000) });

for (const endpoint of ['live', 'ready']) {
  const response = await request(`/api/v1/health/${endpoint}`, {
    headers: { 'X-Request-Id': 'untrusted-value' },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('X-Request-Id'), uuid);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.ok(response.headers.get('Content-Security-Policy'));
  const body = await response.json();
  assert.equal(body.status, endpoint === 'live' ? 'ok' : 'ready');
}
const missing = await request('/api/v1/missing');
assert.equal(missing.status, 404);
const error = await missing.json();
assert.equal(error.error.code, 'NOT_FOUND');
assert.equal(error.error.requestId, missing.headers.get('X-Request-Id'));
for (const locale of ['ru', 'ro']) {
  const response = await request(`/${locale}/`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), new RegExp(`<html lang="${locale}"`));
}
const adminBase = new URL(base);
adminBase.hostname = adminHost;
const admin = await fetch(new URL('/', adminBase), {
  signal: AbortSignal.timeout(10000),
});
assert.equal(admin.status, 200);
assert.match(await admin.text(), /id="app"/);
const adminApi = await fetch(new URL('/api/v1/health/ready', adminBase), {
  signal: AbortSignal.timeout(10000),
});
assert.equal(adminApi.status, 200);
console.log(
  'Stack smoke checks passed: health, correlation, errors, locales, admin host/API.',
);
