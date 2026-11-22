import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

// Run only against the disposable development/CI stack: creates staff, customers, a
// product and stock, then sends competing checkout and order requests at the same time.
// PGlite tests run the same SQL on one connection, so only this check shows how the
// row and advisory locks behave between real PostgreSQL sessions.
const base = process.env.SMOKE_BASE_URL ?? 'http://localhost:8080';
const suffix = randomUUID().slice(0, 8);
const adminSite = {
  Host: 'admin.localhost',
  Origin: 'http://admin.localhost:8080',
};
const shopSite = { Host: 'localhost', Origin: 'http://localhost:8080' };
const delivery = {
  deliveryMethod: 'courier',
  recipientName: 'Race Buyer',
  phone: '069123456',
  address: 'str. Testului 1, ap. 2',
};

function compose(args, input) {
  return execFileSync('docker', ['compose', ...args], {
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).toString();
}
function sql(query) {
  return compose(
    [
      'exec',
      '-T',
      'postgres',
      'sh',
      '-c',
      'psql -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
    ],
    `${query}\n`,
  ).trim();
}
async function call(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let parsed = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Keep the raw text: a proxy error page explains a failure better than a parse error.
  }
  return { status: response.status, body: parsed, headers: response.headers };
}
async function expect(path, status, options = {}) {
  const result = await call(path, options);
  assert.equal(
    result.status,
    status,
    `${options.method ?? 'GET'} ${path}: ${JSON.stringify(result.body)}`,
  );
  return result.body;
}
const outcome = (results) =>
  JSON.stringify(
    results.map(({ status, body }) => body?.error?.code ?? status),
  );
const sessionOf = (result) => result.headers.get('set-cookie').split(';')[0];

const staffAccount = {
  email: `race-staff-${suffix}@example.invalid`,
  password: randomUUID(),
};
compose(
  ['exec', '-T', 'api', 'bee-admin-create'],
  JSON.stringify(staffAccount) + '\n',
);
const staffLogin = await call('/auth/login', {
  method: 'POST',
  body: staffAccount,
  headers: adminSite,
});
assert.equal(staffLogin.status, 200, JSON.stringify(staffLogin.body));
const staff = { ...adminSite, Cookie: sessionOf(staffLogin) };

const category = await expect('/admin/categories', 201, {
  method: 'POST',
  headers: staff,
  body: { slug: `race-${suffix}`, nameRu: 'Гонка', nameRo: 'Cursă' },
});
const translation = (name) => ({
  name,
  description: 'Concurrency check',
  seoTitle: '',
  seoDescription: '',
});
const product = await expect('/admin/products', 201, {
  method: 'POST',
  headers: staff,
  body: {
    slug: `race-${suffix}`,
    status: 'active',
    brandId: null,
    categoryIds: [category.id],
    mediaIds: [],
    translations: {
      ru: translation('Рамка для проверки гонки'),
      ro: translation('Ramă pentru verificarea cursei'),
    },
    variants: [
      {
        sku: `RACE-A-${suffix}`,
        name: 'A',
        priceMinor: 1000,
        active: true,
        attributes: {},
      },
      {
        sku: `RACE-B-${suffix}`,
        name: 'B',
        priceMinor: 2000,
        active: true,
        attributes: {},
      },
    ],
  },
});
const variantA = product.variants.find((item) => item.name === 'A');
const variantB = product.variants.find((item) => item.name === 'B');
const warehouse = await expect('/admin/warehouses', 201, {
  method: 'POST',
  headers: staff,
  body: { code: `race-${suffix}`, name: `Race ${suffix}` },
});
const addStock = (variant, delta) =>
  expect('/admin/inventory/adjustments', 200, {
    method: 'POST',
    headers: { ...staff, 'Idempotency-Key': randomUUID() },
    body: {
      warehouseId: warehouse.id,
      variantId: variant.id,
      delta,
      reason: 'Concurrency check stock',
    },
  });
// Reserved stock must always equal what open (not cancelled) orders hold.
function stock() {
  const rows = JSON.parse(
    sql(`SELECT json_object_agg(v.name, json_build_object(
           'onHand', b.on_hand, 'reserved', b.reserved,
           'ordered', COALESCE((SELECT sum(oi.quantity) FROM order_items oi
                                JOIN orders o ON o.id = oi.order_id
                                WHERE oi.variant_id = v.id AND o.status <> 'cancelled'), 0)))
         FROM inventory_balances b JOIN product_variants v ON v.id = b.variant_id
         WHERE b.warehouse_id = '${warehouse.id}'`),
  );
  for (const [name, row] of Object.entries(rows))
    assert.equal(
      row.reserved,
      row.ordered,
      `variant ${name}: ${JSON.stringify(row)}`,
    );
  return rows;
}

// Registration is limited per address; earlier checks in this stack used part of it.
sql('DELETE FROM auth_throttles;');
const buyers = [];
for (let index = 0; index < 8; index += 1) {
  const registered = await call('/auth/register', {
    method: 'POST',
    headers: shopSite,
    body: {
      email: `race-buyer-${index}-${suffix}@example.invalid`,
      password: `buyer-${randomUUID()}`,
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  buyers.push({ ...shopSite, Cookie: sessionOf(registered) });
}
const putInCart = (buyer, variant, quantity) =>
  expect('/cart/items?locale=ru', 200, {
    method: 'POST',
    headers: buyer,
    body: { variantId: variant.id, quantity },
  });
const placeOrder = (buyer, key = randomUUID()) =>
  call('/orders?locale=ru', {
    method: 'POST',
    headers: { ...buyer, 'Idempotency-Key': key },
    body: delivery,
  });
const changeStatus = (order, from, to) =>
  call(`/admin/orders/${order.id}/status`, {
    method: 'POST',
    headers: staff,
    body: { from, to },
  });

// 1. Eight buyers want the last three units of A; B has five units, so a buyer who
// loses on A must not keep a reservation of B.
await addStock(variantA, 3);
await addStock(variantB, 5);
for (const buyer of buyers) {
  await putInCart(buyer, variantA, 1);
  await putInCart(buyer, variantB, 1);
}
const race = await Promise.all(buyers.map((buyer) => placeOrder(buyer)));
const winners = race.flatMap((result, index) =>
  result.status === 201 ? [index] : [],
);
assert.equal(winners.length, 3, outcome(race));
for (const result of race.filter((item) => item.status !== 201)) {
  assert.equal(result.status, 409, outcome(race));
  assert.equal(result.body.error.code, 'INVENTORY_NOT_AVAILABLE');
}
assert.deepEqual(stock(), {
  A: { onHand: 3, reserved: 3, ordered: 3 },
  B: { onHand: 5, reserved: 3, ordered: 3 },
});
const loser = buyers[race.findIndex((result) => result.status !== 201)];
const keptCart = await expect('/cart?locale=ru', 200, { headers: loser });
assert.equal(
  keptCart.items.length,
  2,
  'a refused order leaves the cart as it was',
);
const winner = buyers[winners[0]];
assert.deepEqual(await expect('/cart?locale=ru', 200, { headers: winner }), {
  items: [],
});
await addStock(variantA, 10);

// 2. A double click with two different keys: the second request waits for the cart
// lock and finds the cart already turned into an order.
await putInCart(winner, variantA, 1);
const doubleClick = await Promise.all([placeOrder(winner), placeOrder(winner)]);
assert.deepEqual(
  doubleClick.map((result) => result.status).sort(),
  [201, 409],
  outcome(doubleClick),
);
assert.equal(
  doubleClick.find((result) => result.status === 409).body.error.code,
  'CART_EMPTY',
);

// 3. Retries with one key arrive together: one order, the others replay it.
await putInCart(winner, variantA, 1);
const key = randomUUID();
const retries = await Promise.all(
  Array.from({ length: 5 }, () => placeOrder(winner, key)),
);
assert.deepEqual(
  retries.map((result) => result.status).sort(),
  [200, 200, 200, 200, 201],
  outcome(retries),
);
assert.equal(new Set(retries.map((result) => result.body.id)).size, 1);
assert.equal(
  retries.filter((result) => result.body.replayed === false).length,
  1,
);
const history = await expect('/orders', 200, { headers: winner });
assert.equal(
  history.items.filter((item) => item.id === retries[0].body.id).length,
  1,
);

// 4. The customer cancels while a manager confirms: exactly one of them wins, and
// stock is released only when the cancellation wins.
const winsSeen = new Set();
for (let round = 0; round < 4; round += 1) {
  await putInCart(winner, variantA, 1);
  const placed = await placeOrder(winner);
  assert.equal(placed.status, 201, outcome([placed]));
  const [cancel, confirm] = await Promise.all([
    call(`/orders/${placed.body.id}/cancel`, {
      method: 'POST',
      headers: winner,
    }),
    changeStatus(placed.body, 'new', 'confirmed'),
  ]);
  assert.deepEqual(
    [cancel.status, confirm.status].sort(),
    [200, 409],
    outcome([cancel, confirm]),
  );
  const final = cancel.status === 200 ? 'cancelled' : 'confirmed';
  winsSeen.add(final);
  if (final === 'cancelled')
    assert.equal(confirm.body.error.code, 'ORDER_STATUS_CHANGED');
  else assert.equal(cancel.body.error.code, 'ORDER_NOT_CANCELLABLE');
  const order = await expect(`/orders/${placed.body.id}`, 200, {
    headers: winner,
  });
  assert.equal(order.status, final);
  assert.deepEqual(
    order.history.map((step) => step.status),
    ['new', final],
  );
  stock();
}

// 5. Two managers confirm the same order at once: both see it confirmed, the history
// records the step once.
await putInCart(winner, variantA, 1);
const shared = await placeOrder(winner);
assert.equal(shared.status, 201, outcome([shared]));
const confirmations = await Promise.all([
  changeStatus(shared.body, 'new', 'confirmed'),
  changeStatus(shared.body, 'new', 'confirmed'),
]);
assert.deepEqual(
  confirmations.map((result) => result.status),
  [200, 200],
  outcome(confirmations),
);
const managed = await expect(`/admin/orders/${shared.body.id}`, 200, {
  headers: staff,
});
assert.deepEqual(
  managed.history.map((step) => step.status),
  ['new', 'confirmed'],
);

const finalStock = stock();
assert.equal(finalStock.A.onHand, 13);
assert.equal(finalStock.B.onHand, 5);
assert.equal(finalStock.B.reserved, 3);
assert.ok(finalStock.A.reserved <= finalStock.A.onHand);
console.log(
  `Concurrent checkout passed: 8 buyers for 3 units (no oversell, no partial reservation, carts kept), double submit, 5 parallel retries with one key, customer cancel against staff confirm (outcomes seen: ${[...winsSeen].join(', ')}), parallel staff confirmations; reserved stock equals open orders.`,
);
