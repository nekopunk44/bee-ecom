import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();

let customer;
let staff;
let variant;
let warehouse;

before(async () => {
  const directory = new URL('../database/migrations/', import.meta.url);
  for (const name of (await readdir(directory))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await db.exec(await readFile(new URL(name, directory), 'utf8'));

  customer = (
    await db.query(
      "INSERT INTO users(email,password_hash) VALUES('om-customer@example.test','x') RETURNING id",
    )
  ).rows[0].id;
  staff = (
    await db.query(
      "INSERT INTO users(email,password_hash) VALUES('om-staff@example.test','x') RETURNING id",
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO user_roles(user_id,role_code) VALUES($1,'ADMIN')",
    [staff],
  );

  const product = (
    await db.query(
      "INSERT INTO products(slug,status) VALUES('om-honey','active') RETURNING id",
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO product_translations(product_id,locale,name) VALUES($1,'ru','Мёд'),($1,'ro','Miere')",
    [product],
  );
  variant = (
    await db.query(
      "INSERT INTO product_variants(product_id,sku,name,price_minor) VALUES($1,'OM-HONEY-1','Jar 500g',12500) RETURNING id",
      [product],
    )
  ).rows[0].id;
  warehouse = (
    await db.query(
      "INSERT INTO warehouses(code,name) VALUES('om-main','Main warehouse') RETURNING id",
    )
  ).rows[0].id;
  await db.query(
    'INSERT INTO inventory_balances(warehouse_id,variant_id,on_hand) VALUES($1,$2,500)',
    [warehouse, variant],
  );
});

after(() => db.close());

const setItem = (cust, qty = 1) =>
  db
    .query('SELECT customer_cart_set_item($1,$2,$3,$4) AS r', [
      cust,
      variant,
      qty,
      'ru',
    ])
    .then((r) => r.rows[0].r);

const place = async (cust, details, lang = 'ru', qty = 1) => {
  await setItem(cust, qty);
  const key = randomUUID();
  const result = (
    await db.query('SELECT order_place($1,$2,$3::jsonb,$4) AS r', [
      cust,
      key,
      JSON.stringify(details),
      lang,
    ])
  ).rows[0].r;
  assert.equal(
    result.failure,
    undefined,
    `order placement failed: ${JSON.stringify(result)}`,
  );
  return result;
};

const transition = (actor, orderId, from, to, fields = {}) => {
  const correlation = randomUUID();
  return db
    .query('SELECT order_transition($1,$2,$3,$4::jsonb) AS r', [
      actor,
      orderId,
      correlation,
      JSON.stringify({ from, to, ...fields }),
    ])
    .then((r) => ({ result: r.rows[0].r, correlation }));
};

const balance = () =>
  db
    .query(
      'SELECT on_hand,reserved FROM inventory_balances WHERE warehouse_id=$1 AND variant_id=$2',
      [warehouse, variant],
    )
    .then((r) => r.rows[0]);

const orderEvents = (orderId) =>
  db
    .query(
      'SELECT status,actor_id FROM order_events WHERE order_id=$1 ORDER BY id',
      [orderId],
    )
    .then((r) => r.rows);

const outboxEvents = (orderId) =>
  db
    .query(
      "SELECT payload FROM outbox_events WHERE aggregate_id=$1 AND event_type='order.status_changed' ORDER BY created_at ASC",
      [orderId],
    )
    .then((r) => r.rows.map((row) => row.payload));

const auditLogs = (orderId, correlation) =>
  db
    .query(
      'SELECT actor_id,action FROM audit_logs WHERE entity_id=$1 AND request_id=$2',
      [orderId, correlation],
    )
    .then((r) => r.rows);

const reservationStatus = (orderId) =>
  db
    .query(
      'SELECT r.status FROM inventory_reservations r JOIN orders o ON o.reservation_id=r.id WHERE o.id=$1',
      [orderId],
    )
    .then((r) => r.rows[0]?.status);

const lastSaleMovement = (actorId) =>
  db
    .query(
      "SELECT quantity_delta,reserved_delta FROM inventory_movements WHERE movement_type='sale' AND actor_id=$1 ORDER BY created_at DESC LIMIT 1",
      [actorId],
    )
    .then((r) => r.rows[0]);

// ─── 1. Full courier/post path ────────────────────────────────────────────────

test('courier order: new → confirmed → ready → shipped → completed', async () => {
  const beforeOrder = await balance();
  const order = await place(
    customer,
    {
      deliveryMethod: 'courier',
      recipientName: 'Ion Popescu',
      phone: '069 123 456',
      address: 'str. Pushkin 1, ap. 5',
    },
    'ru',
  );
  const reserved = await balance();
  assert.equal(reserved.on_hand, beforeOrder.on_hand);
  assert.equal(reserved.reserved, beforeOrder.reserved + 1);

  const { result: confirmed, correlation: correlation1 } = await transition(
    staff,
    order.id,
    'new',
    'confirmed',
    { deliveryPriceMinor: 4500 },
  );
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.deliveryPriceMinor, 4500);
  assert.equal(confirmed.totalMinor, confirmed.itemsTotalMinor + 4500);
  assert.deepEqual(await orderEvents(order.id), [
    { status: 'new', actor_id: customer },
    { status: 'confirmed', actor_id: staff },
  ]);
  assert.deepEqual(await outboxEvents(order.id), [
    { orderId: order.id, number: order.number, from: 'new', to: 'confirmed' },
  ]);
  assert.deepEqual(await auditLogs(order.id, correlation1), [
    { actor_id: staff, action: 'order.confirmed' },
  ]);

  const { result: ready, correlation: correlation2 } = await transition(
    staff,
    order.id,
    'confirmed',
    'ready',
  );
  assert.equal(ready.status, 'ready');
  assert.deepEqual(await orderEvents(order.id), [
    { status: 'new', actor_id: customer },
    { status: 'confirmed', actor_id: staff },
    { status: 'ready', actor_id: staff },
  ]);
  assert.deepEqual(await outboxEvents(order.id), [
    { orderId: order.id, number: order.number, from: 'new', to: 'confirmed' },
    { orderId: order.id, number: order.number, from: 'confirmed', to: 'ready' },
  ]);
  assert.deepEqual(await auditLogs(order.id, correlation2), [
    { actor_id: staff, action: 'order.ready' },
  ]);

  const { result: shipped, correlation: correlation3 } = await transition(
    staff,
    order.id,
    'ready',
    'shipped',
    { trackingNumber: ' RR123MD ' },
  );
  assert.equal(shipped.status, 'shipped');
  assert.equal(shipped.trackingNumber, 'RR123MD');
  assert.deepEqual(await orderEvents(order.id), [
    { status: 'new', actor_id: customer },
    { status: 'confirmed', actor_id: staff },
    { status: 'ready', actor_id: staff },
    { status: 'shipped', actor_id: staff },
  ]);
  assert.deepEqual(await outboxEvents(order.id), [
    { orderId: order.id, number: order.number, from: 'new', to: 'confirmed' },
    { orderId: order.id, number: order.number, from: 'confirmed', to: 'ready' },
    { orderId: order.id, number: order.number, from: 'ready', to: 'shipped' },
  ]);
  assert.deepEqual(await auditLogs(order.id, correlation3), [
    { actor_id: staff, action: 'order.shipped' },
  ]);

  const afterShipping = await balance();
  assert.equal(afterShipping.on_hand, beforeOrder.on_hand - 1);
  assert.equal(afterShipping.reserved, beforeOrder.reserved);
  const movement = await lastSaleMovement(staff);
  assert.deepEqual(movement, { quantity_delta: -1, reserved_delta: -1 });
  assert.equal(await reservationStatus(order.id), 'fulfilled');

  const { result: completed, correlation: correlation4 } = await transition(
    staff,
    order.id,
    'shipped',
    'completed',
  );
  assert.equal(completed.status, 'completed');
  assert.deepEqual(await orderEvents(order.id), [
    { status: 'new', actor_id: customer },
    { status: 'confirmed', actor_id: staff },
    { status: 'ready', actor_id: staff },
    { status: 'shipped', actor_id: staff },
    { status: 'completed', actor_id: staff },
  ]);
  assert.deepEqual(await outboxEvents(order.id), [
    { orderId: order.id, number: order.number, from: 'new', to: 'confirmed' },
    { orderId: order.id, number: order.number, from: 'confirmed', to: 'ready' },
    { orderId: order.id, number: order.number, from: 'ready', to: 'shipped' },
    {
      orderId: order.id,
      number: order.number,
      from: 'shipped',
      to: 'completed',
    },
  ]);
  assert.deepEqual(await auditLogs(order.id, correlation4), [
    { actor_id: staff, action: 'order.completed' },
  ]);
});

// ─── 2. Post order path (same as courier but no delivery price at confirm) ────

test('post order: new → confirmed → ready → shipped → completed', async () => {
  const order = await place(
    customer,
    {
      deliveryMethod: 'post',
      recipientName: 'Ion Popescu',
      phone: '069 123 456',
      locality: 'Soroca',
      address: 'str. Florilor 10',
      postalCode: '2001',
    },
    'ru',
  );
  await transition(staff, order.id, 'new', 'confirmed');
  await transition(staff, order.id, 'confirmed', 'ready');
  await transition(staff, order.id, 'ready', 'shipped', {
    trackingNumber: 'POST123',
  });
  const { result: completed } = await transition(
    staff,
    order.id,
    'shipped',
    'completed',
  );
  assert.equal(completed.status, 'completed');
  assert.equal(await reservationStatus(order.id), 'fulfilled');
});

// ─── 3. Pickup path ────────────────────────────────────────────────────────────

test('pickup order: ready → shipped returns INVALID_TRANSITION; ready → completed succeeds', async () => {
  const order = await place(
    customer,
    {
      deliveryMethod: 'pickup',
      warehouseId: warehouse,
      recipientName: 'Ion Popescu',
      phone: '069 123 456',
    },
    'ru',
  );
  await transition(staff, order.id, 'new', 'confirmed');
  await transition(staff, order.id, 'confirmed', 'ready');

  const { result: invalidShip } = await transition(
    staff,
    order.id,
    'ready',
    'shipped',
  );
  assert.equal(invalidShip.failure, 'INVALID_TRANSITION');

  const { result: completed, correlation } = await transition(
    staff,
    order.id,
    'ready',
    'completed',
  );
  assert.equal(completed.status, 'completed');
  const movement = await lastSaleMovement(staff);
  assert.deepEqual(movement, { quantity_delta: -1, reserved_delta: -1 });
  assert.equal(await reservationStatus(order.id), 'fulfilled');
  assert.deepEqual(await auditLogs(order.id, correlation), [
    { actor_id: staff, action: 'order.completed' },
  ]);
});

// ─── 4. Cancellation ──────────────────────────────────────────────────────────

test('cancelling a ready order releases stock; shipped and completed cannot be cancelled', async () => {
  const beforeOrder = await balance();
  const readyOrder = await place(
    customer,
    {
      deliveryMethod: 'courier',
      recipientName: 'Ion Popescu',
      phone: '069 123 456',
      address: 'str. Pushkin 1, ap. 5',
    },
    'ru',
  );
  await transition(staff, readyOrder.id, 'new', 'confirmed');
  await transition(staff, readyOrder.id, 'confirmed', 'ready');
  const beforeCancel = await balance();
  assert.equal(beforeCancel.on_hand, beforeOrder.on_hand);
  assert.equal(beforeCancel.reserved, beforeOrder.reserved + 1);

  const { result: cancelled, correlation } = await transition(
    staff,
    readyOrder.id,
    'ready',
    'cancelled',
  );
  assert.equal(cancelled.status, 'cancelled');
  const afterCancel = await balance();
  assert.equal(afterCancel.on_hand, beforeOrder.on_hand);
  assert.equal(afterCancel.reserved, beforeOrder.reserved);
  assert.equal(await reservationStatus(readyOrder.id), 'released');
  assert.deepEqual(await auditLogs(readyOrder.id, correlation), [
    { actor_id: staff, action: 'order.cancelled' },
  ]);

  const shippedOrder = await place(
    customer,
    {
      deliveryMethod: 'courier',
      recipientName: 'Ion Popescu',
      phone: '069 123 456',
      address: 'str. Pushkin 1, ap. 5',
    },
    'ru',
  );
  await transition(staff, shippedOrder.id, 'new', 'confirmed');
  await transition(staff, shippedOrder.id, 'confirmed', 'ready');
  await transition(staff, shippedOrder.id, 'ready', 'shipped');
  const { result: invalidCancelShipped } = await transition(
    staff,
    shippedOrder.id,
    'shipped',
    'cancelled',
  );
  assert.equal(invalidCancelShipped.failure, 'INVALID_TRANSITION');

  const completedOrder = await place(
    customer,
    {
      deliveryMethod: 'pickup',
      warehouseId: warehouse,
      recipientName: 'Ion Popescu',
      phone: '069 123 456',
    },
    'ru',
  );
  await transition(staff, completedOrder.id, 'new', 'confirmed');
  await transition(staff, completedOrder.id, 'confirmed', 'ready');
  await transition(staff, completedOrder.id, 'ready', 'completed');
  const { result: invalidCancelCompleted } = await transition(
    staff,
    completedOrder.id,
    'completed',
    'cancelled',
  );
  assert.equal(invalidCancelCompleted.failure, 'INVALID_TRANSITION');
});

// ─── 5. Stale and repeated transitions ────────────────────────────────────────

test('stale transition returns ORDER_STATUS_CHANGED; repeated step returns document, no new events', async () => {
  const order = await place(
    customer,
    {
      deliveryMethod: 'courier',
      recipientName: 'Ion Popescu',
      phone: '069 123 456',
      address: 'str. Pushkin 1, ap. 5',
    },
    'ru',
  );
  const { correlation: correlation1 } = await transition(
    staff,
    order.id,
    'new',
    'confirmed',
    { deliveryPriceMinor: 4500 },
  );

  const { result: stale } = await transition(staff, order.id, 'new', 'ready');
  assert.equal(stale.failure, 'ORDER_STATUS_CHANGED');

  const beforeCounts = {
    events: (await orderEvents(order.id)).length,
    outbox: (await outboxEvents(order.id)).length,
    audits: (
      await db.query(
        'SELECT count(*)::int AS c FROM audit_logs WHERE entity_id=$1 AND action LIKE $2',
        [order.id, 'order.%'],
      )
    ).rows[0].c,
  };

  const { result: repeated, correlation: correlation2 } = await transition(
    staff,
    order.id,
    'new',
    'confirmed',
    { deliveryPriceMinor: 4500 },
  );
  assert.equal(repeated.id, order.id);
  assert.equal(repeated.status, 'confirmed');
  assert.equal(repeated.deliveryPriceMinor, 4500);

  const afterCounts = {
    events: (await orderEvents(order.id)).length,
    outbox: (await outboxEvents(order.id)).length,
    audits: (
      await db.query(
        'SELECT count(*)::int AS c FROM audit_logs WHERE entity_id=$1 AND action LIKE $2',
        [order.id, 'order.%'],
      )
    ).rows[0].c,
  };
  assert.deepEqual(afterCounts, beforeCounts);
  assert.deepEqual(await auditLogs(order.id, correlation2), []);
});

// ─── 6. Validation ─────────────────────────────────────────────────────────────

test('validation: deliveryPriceMinor on pickup, negative, non-integer, on ready → INVALID_DELIVERY_PRICE', async () => {
  const pickup = await place(
    customer,
    {
      deliveryMethod: 'pickup',
      warehouseId: warehouse,
      recipientName: 'Ion Popescu',
      phone: '069 123 456',
    },
    'ru',
  );
  assert.equal(
    (
      await transition(staff, pickup.id, 'new', 'confirmed', {
        deliveryPriceMinor: 100,
      })
    ).result.failure,
    'INVALID_DELIVERY_PRICE',
  );

  for (const price of [-1, 1.5, 100000001]) {
    const order = await place(
      customer,
      {
        deliveryMethod: 'courier',
        recipientName: 'Ion Popescu',
        phone: '069 123 456',
        address: 'str. Pushkin 1, ap. 5',
      },
      'ru',
    );
    assert.equal(
      (
        await transition(staff, order.id, 'new', 'confirmed', {
          deliveryPriceMinor: price,
        })
      ).result.failure,
      'INVALID_DELIVERY_PRICE',
    );
  }

  const priceOnReady = await place(
    customer,
    {
      deliveryMethod: 'courier',
      recipientName: 'Ion Popescu',
      phone: '069 123 456',
      address: 'str. Pushkin 1, ap. 5',
    },
    'ru',
  );
  await transition(staff, priceOnReady.id, 'new', 'confirmed', {
    deliveryPriceMinor: 4500,
  });
  assert.equal(
    (
      await transition(staff, priceOnReady.id, 'confirmed', 'ready', {
        deliveryPriceMinor: 100,
      })
    ).result.failure,
    'INVALID_DELIVERY_PRICE',
  );
});

test('validation: trackingNumber on confirmed, empty, >64 chars → INVALID_TRACKING_NUMBER', async () => {
  const trackingOnConfirm = await place(
    customer,
    {
      deliveryMethod: 'courier',
      recipientName: 'Ion Popescu',
      phone: '069 123 456',
      address: 'str. Pushkin 1, ap. 5',
    },
    'ru',
  );
  assert.equal(
    (
      await transition(staff, trackingOnConfirm.id, 'new', 'confirmed', {
        trackingNumber: 'RR123MD',
      })
    ).result.failure,
    'INVALID_TRACKING_NUMBER',
  );

  for (const trackingNumber of ['', 'T'.repeat(65)]) {
    const order = await place(
      customer,
      {
        deliveryMethod: 'courier',
        recipientName: 'Ion Popescu',
        phone: '069 123 456',
        address: 'str. Pushkin 1, ap. 5',
      },
      'ru',
    );
    await transition(staff, order.id, 'new', 'confirmed', {
      deliveryPriceMinor: 4500,
    });
    await transition(staff, order.id, 'confirmed', 'ready');
    assert.equal(
      (
        await transition(staff, order.id, 'ready', 'shipped', {
          trackingNumber,
        })
      ).result.failure,
      'INVALID_TRACKING_NUMBER',
    );
  }
});

test('validation: unknown order id → NOT_FOUND', async () => {
  assert.deepEqual(
    (await transition(staff, randomUUID(), 'new', 'confirmed')).result,
    { failure: 'NOT_FOUND' },
  );
});

// ─── 7. Admin order documents ─────────────────────────────────────────────────

test('admin_orders_document filters, searches, counts statuses, and paginates', async () => {
  const fixtures = [];
  for (let i = 1; i <= 3; i++) {
    fixtures.push(
      await place(
        customer,
        {
          deliveryMethod: 'courier',
          recipientName: 'Admin List Fixture',
          phone: '069 123 456',
          address: 'str. Test 1, ap. 1',
        },
        'ru',
      ),
    );
  }
  await transition(staff, fixtures[1].id, 'new', 'confirmed', {
    deliveryPriceMinor: 4500,
  });

  const byStatus = (
    await db.query("SELECT admin_orders_document('confirmed',NULL,25,0) AS r")
  ).rows[0].r;
  assert.ok(byStatus.items.some((item) => item.id === fixtures[1].id));
  assert.ok(byStatus.items.every((item) => item.status === 'confirmed'));

  const byNumber = (
    await db.query('SELECT admin_orders_document(NULL,$1,25,0) AS r', [
      fixtures[0].number.slice(-3),
    ])
  ).rows[0].r;
  assert.ok(byNumber.items.some((item) => item.id === fixtures[0].id));

  const byRecipient = (
    await db.query('SELECT admin_orders_document(NULL,$1,25,0) AS r', [
      'aDmIn LiSt FiXtUrE',
    ])
  ).rows[0].r;
  assert.equal(byRecipient.total, 3);

  const byPhone = (
    await db.query('SELECT admin_orders_document(NULL,$1,25,0) AS r', [
      '069 123',
    ])
  ).rows[0].r;
  assert.ok(
    byPhone.items.some((item) =>
      fixtures.some((order) => order.id === item.id),
    ),
  );

  const page = (
    await db.query('SELECT admin_orders_document(NULL,$1,1,0) AS r', [
      'Admin List Fixture',
    ])
  ).rows[0].r;
  assert.equal(page.total, 3);
  assert.equal(page.items.length, 1);

  const statusNames = [
    'new',
    'confirmed',
    'ready',
    'shipped',
    'completed',
    'cancelled',
  ];
  assert.deepEqual(
    Object.keys(byRecipient.counts).sort(),
    [...statusNames].sort(),
  );
  for (const count of Object.values(byRecipient.counts))
    assert.equal(typeof count, 'number');

  const document = (
    await db.query('SELECT admin_order_document($1) AS r', [fixtures[0].id])
  ).rows[0].r;
  assert.equal(document.id, fixtures[0].id);
  assert.deepEqual(
    (await db.query('SELECT admin_order_document($1) AS r', [randomUUID()]))
      .rows[0].r,
    { failure: 'NOT_FOUND' },
  );
});
