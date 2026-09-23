import assert from 'node:assert/strict';
const base = process.env.SMOKE_BASE_URL ?? 'http://localhost:8080';
const live = await fetch(`${base}/api/v1/health/live`);
assert.equal(live.status, 200);
const response = await fetch(`${base}/api/v1/health/ready`, {
  signal: AbortSignal.timeout(10000),
});
assert.equal(response.status, 503);
const body = await response.json();
assert.equal(body.error.code, 'DEPENDENCY_UNAVAILABLE');
assert.equal(body.error.requestId, response.headers.get('X-Request-Id'));
console.log('Dependency outage: liveness remains up, readiness is 503.');
