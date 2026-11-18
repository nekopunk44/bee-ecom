import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();

let customer, otherCustomer;
let productId, variantA, variantB;
let warehouseMain, warehousePickup;

before(async () => {
  const directory = new URL('../database/migrations/', import.meta.url);
  for (const name of (await readdir(directory))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await db.exec(await readFile(new URL(name, directory), 'utf8'));

  // Two customers
  customer = (
    await db.query(
      "INSERT INTO users(email,password_hash) VALUES('orders-c1@example.test','x') RETURNING id",
    )
  ).rows[0].id;
  otherCustomer = (
    await db.query(
      "INSERT INTO users(email,password_hash) VALUES('orders-c2@example.test','x') RETURNING id",
    )
  ).rows[0].id;

  // One active product with ru and ro translations
  productId = (
    await db.query(
      "INSERT INTO products(slug,status) VALUES('honey','active') RETURNING id",
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO product_translations(product_id,locale,name) VALUES($1,'ru','Мёд'),($1,'ro','Miere')",
    [productId],
  );

  // Variant A price 12500, Variant B price 30000
  variantA = (
    await db.query(
      "INSERT INTO product_variants(product_id,sku,name,price_minor) VALUES($1,'SKU-A','Jar 500g',12500) RETURNING id",
      [productId],
    )
  ).rows[0].id;
  variantB = (
    await db.query(
      "INSERT INTO product_variants(product_id,sku,name,price_minor) VALUES($1,'SKU-B','Jar 1kg',30000) RETURNING id",
      [productId],
    )
  ).rows[0].id;

  // Warehouses
  warehouseMain = (
    await db.query(
      "INSERT INTO warehouses(code,name) VALUES('a-main','Main') RETURNING id",
    )
  ).rows[0].id;
  warehousePickup = (
    await db.query(
      "INSERT INTO warehouses(code,name) VALUES('b-pickup','Pickup') RETURNING id",
    )
  ).rows[0].id;

  // Balances: A: main=3, pickup=1; B: main=2
  await db.query(
    'INSERT INTO inventory_balances(warehouse_id,variant_id,on_hand) VALUES($1,$2,3)',
    [warehouseMain, variantA],
  );
  await db.query(
    'INSERT INTO inventory_balances(warehouse_id,variant_id,on_hand) VALUES($1,$2,1)',
    [warehousePickup, variantA],
  );
  await db.query(
    'INSERT INTO inventory_balances(warehouse_id,variant_id,on_hand) VALUES($1,$2,2)',
    [warehouseMain, variantB],
  );
});

after(() => db.close());

// Helper: set item in cart
const setItem = (cust, variant, qty = 1) =>
  db
    .query('SELECT customer_cart_set_item($1,$2,$3,$4) AS r', [
      cust,
      variant,
      qty,
      'ru',
    ])
    .then((r) => r.rows[0].r);

// Helper: place an order
const place = (cust, details, lang = 'ru', key = randomUUID()) =>
  db
    .query('SELECT order_place($1,$2,$3::jsonb,$4) AS r', [
      cust,
      key,
      JSON.stringify(details),
      lang,
    ])
    .then((r) => r.rows[0].r);

// Earlier tests keep their orders, so each later test restores the initial free
// stock (A: main 3, pickup 1; B: main 2) on top of what is already reserved.
const restock = () =>
  db.query(
    `UPDATE inventory_balances b SET on_hand = b.reserved + CASE
       WHEN b.variant_id = $1 AND b.warehouse_id = $3 THEN 3
       WHEN b.variant_id = $1 AND b.warehouse_id = $4 THEN 1
       WHEN b.variant_id = $2 AND b.warehouse_id = $3 THEN 2 ELSE b.on_hand - b.reserved END`,
    [variantA, variantB, warehouseMain, warehousePickup],
  );

// Helper: checkout document
const checkout = (cust, lang = 'ru') =>
  db
    .query('SELECT checkout_document($1,$2) AS r', [cust, lang])
    .then((r) => r.rows[0].r);

// ─── Test 1: checkout_document ───────────────────────────────────────────────

test('checkout_document: items total, courier price, warehouse readiness', async () => {
  // Set up a fresh customer for this test to avoid cart state leakage
  const c = (
    await db.query(
      "INSERT INTO users(email,password_hash) VALUES('chk@example.test','x') RETURNING id",
    )
  ).rows[0].id;

  const emptyDoc = await checkout(c);
  assert.equal(emptyDoc.itemsTotalMinor, 0);
  assert.equal(emptyDoc.courierPriceMinor, null);
  assert.ok(Array.isArray(emptyDoc.warehouses));
  assert.equal(emptyDoc.warehouses.length, 2);

  // With an empty cart every warehouse is ready
  for (const w of emptyDoc.warehouses) {
    assert.equal(w.ready, true);
  }

  // Add A×2 to cart (Main has 3, Pickup has 1)
  await setItem(c, variantA, 2);
  const doc2 = await checkout(c);
  // 2 × 12500
  assert.equal(doc2.itemsTotalMinor, 25000);

  const byName = Object.fromEntries(doc2.warehouses.map((w) => [w.name, w]));
  // Main has 3 on hand → ready; Pickup has 1 → NOT ready for qty 2
  assert.equal(byName['Main'].ready, true);
  assert.equal(byName['Pickup'].ready, false);

  // Clean up cart
  await db.query(
    'DELETE FROM customer_cart_items ci USING customer_carts c WHERE ci.cart_id=c.id AND c.user_id=$1',
    [c],
  );
});

// ─── Test 2: courier order ───────────────────────────────────────────────────

test('courier order A×2 + B×1 creates B-1001, correct totals, empties cart, converted reservation', async () => {
  // Add items to main customer cart
  await setItem(customer, variantA, 2);
  await setItem(customer, variantB, 1);

  const key = randomUUID();
  const result = await place(
    customer,
    {
      deliveryMethod: 'courier',
      recipientName: 'Ion Popescu',
      phone: '069 123 456',
      address: 'str. Pushkin 1, ap. 5',
    },
    'ru',
    key,
  );

  assert.equal(
    result.failure,
    undefined,
    `expected success, got failure: ${result.failure}`,
  );
  assert.equal(result.number, 'B-1001');
  assert.equal(result.status, 'new');
  assert.equal(result.phone, '+37369123456');
  // items total: 2*12500 + 1*30000 = 55000
  assert.equal(result.itemsTotalMinor, 55000);
  assert.equal(result.deliveryPriceMinor, null);
  assert.equal(result.totalMinor, null);
  assert.equal(result.replayed, false);

  // Russian item names
  for (const item of result.items) {
    assert.equal(item.name, 'Мёд');
  }

  // Cart is empty afterwards
  const cartItems = await db.query(
    'SELECT count(*)::int AS cnt FROM customer_cart_items ci JOIN customer_carts c ON c.id=ci.cart_id WHERE c.user_id=$1',
    [customer],
  );
  assert.equal(cartItems.rows[0].cnt, 0);

  // Reservation status is 'converted'
  const resStatus = await db.query(
    'SELECT status FROM inventory_reservations WHERE id=$1',
    [
      (
        await db.query('SELECT reservation_id FROM orders WHERE id=$1', [
          result.id,
        ])
      ).rows[0].reservation_id,
    ],
  );
  assert.equal(resStatus.rows[0].status, 'converted');

  // Reserved stock increased
  const aMain = await db.query(
    'SELECT reserved FROM inventory_balances WHERE warehouse_id=$1 AND variant_id=$2',
    [warehouseMain, variantA],
  );
  assert.ok(aMain.rows[0].reserved >= 2);

  // One order.placed outbox row
  const outbox = await db.query(
    "SELECT count(*)::int AS cnt FROM outbox_events WHERE event_type='order.placed' AND aggregate_id=$1",
    [result.id],
  );
  assert.equal(outbox.rows[0].cnt, 1);
});

// ─── Test 3: idempotency ─────────────────────────────────────────────────────

test('replay with same key returns same id with replayed:true; different details → IDEMPOTENCY_CONFLICT', async () => {
  // Set up cart
  await setItem(customer, variantA, 1);

  const key = randomUUID();
  const details = {
    deliveryMethod: 'courier',
    recipientName: 'Ion Popescu',
    phone: '069 123 456',
    address: 'str. Pushkin 1, ap. 5',
  };

  const first = await place(customer, details, 'ru', key);
  assert.equal(
    first.failure,
    undefined,
    `first placement failed: ${JSON.stringify(first)}`,
  );
  const orderId = first.id;

  // Replay: same key, same details
  const replay = await place(customer, details, 'ru', key);
  assert.equal(replay.id, orderId);
  assert.equal(replay.replayed, true);

  // Same key, different details → conflict
  const conflict = await place(
    customer,
    { ...details, recipientName: 'Alt Name' },
    'ru',
    key,
  );
  assert.equal(conflict.failure, 'IDEMPOTENCY_CONFLICT');
});

// ─── Test 4: invalid phone ───────────────────────────────────────────────────

test('invalid phone returns INVALID_PHONE, cart unchanged, nothing reserved', async () => {
  // Add to cart
  await setItem(customer, variantA, 1);

  const beforeReserved = (
    await db.query(
      'SELECT sum(reserved)::int AS r FROM inventory_balances WHERE variant_id=$1',
      [variantA],
    )
  ).rows[0].r;

  const beforeCartCount = (
    await db.query(
      'SELECT count(*)::int AS cnt FROM customer_cart_items ci JOIN customer_carts c ON c.id=ci.cart_id WHERE c.user_id=$1',
      [customer],
    )
  ).rows[0].cnt;

  const result = await place(customer, {
    deliveryMethod: 'courier',
    recipientName: 'Ion Popescu',
    phone: 'not-a-phone',
    address: 'str. Pushkin 1, ap. 5',
  });

  assert.equal(result.failure, 'INVALID_PHONE');

  // Cart unchanged
  const afterCartCount = (
    await db.query(
      'SELECT count(*)::int AS cnt FROM customer_cart_items ci JOIN customer_carts c ON c.id=ci.cart_id WHERE c.user_id=$1',
      [customer],
    )
  ).rows[0].cnt;
  assert.equal(afterCartCount, beforeCartCount);

  // Nothing reserved
  const afterReserved = (
    await db.query(
      'SELECT sum(reserved)::int AS r FROM inventory_balances WHERE variant_id=$1',
      [variantA],
    )
  ).rows[0].r;
  assert.equal(afterReserved, beforeReserved);
});

// ─── Test 5: pickup warehouse restriction ────────────────────────────────────

test('pickup at b-pickup fails for A×2 (only 1 there); succeeds at a-main, items only from a-main', async () => {
  await restock();
  // Set cart: A×2
  await setItem(customer, variantA, 2);

  const beforeReservations = (
    await db.query('SELECT count(*)::int AS cnt FROM inventory_reservations')
  ).rows[0].cnt;

  // Try pickup at b-pickup (only 1 on hand there)
  const failResult = await place(customer, {
    deliveryMethod: 'pickup',
    warehouseId: warehousePickup,
    recipientName: 'Ion Popescu',
    phone: '069 123 456',
  });
  assert.equal(failResult.failure, 'INVENTORY_NOT_AVAILABLE');
  assert.equal(failResult.variantId, variantA);

  // No new reservation created
  const afterFailReservations = (
    await db.query('SELECT count(*)::int AS cnt FROM inventory_reservations')
  ).rows[0].cnt;
  assert.equal(afterFailReservations, beforeReservations);

  // Cart still has items
  const cartCount = (
    await db.query(
      'SELECT count(*)::int AS cnt FROM customer_cart_items ci JOIN customer_carts c ON c.id=ci.cart_id WHERE c.user_id=$1',
      [customer],
    )
  ).rows[0].cnt;
  assert.ok(cartCount > 0);

  // Now succeed at a-main
  const successResult = await place(customer, {
    deliveryMethod: 'pickup',
    warehouseId: warehouseMain,
    recipientName: 'Ion Popescu',
    phone: '069 123 456',
  });

  assert.equal(
    successResult.failure,
    undefined,
    `expected success: ${JSON.stringify(successResult)}`,
  );
  assert.equal(successResult.deliveryPriceMinor, 0);
  assert.equal(successResult.totalMinor, successResult.itemsTotalMinor);

  // All reservation items are from a-main only
  const resId = (
    await db.query('SELECT reservation_id FROM orders WHERE id=$1', [
      successResult.id,
    ])
  ).rows[0].reservation_id;
  const resItems = (
    await db.query(
      'SELECT warehouse_id FROM inventory_reservation_items WHERE reservation_id=$1',
      [resId],
    )
  ).rows;
  for (const ri of resItems) {
    assert.equal(ri.warehouse_id, warehouseMain);
  }
});

// ─── Test 6: post order ──────────────────────────────────────────────────────

test('post order: postalCode 2001 stored as MD-2001; missing locality → INVALID_LOCALITY', async () => {
  await restock();
  await setItem(customer, variantA, 1);

  const noLocality = await place(customer, {
    deliveryMethod: 'post',
    recipientName: 'Ion Popescu',
    phone: '069 123 456',
    address: 'str. Pushkin 1, ap. 5',
    // no locality
  });
  assert.equal(noLocality.failure, 'INVALID_LOCALITY');

  // Now with locality
  await setItem(customer, variantA, 1);
  const good = await place(customer, {
    deliveryMethod: 'post',
    recipientName: 'Ion Popescu',
    phone: '069 123 456',
    locality: 'Soroca',
    address: 'str. Florilor 10',
    postalCode: '2001',
  });

  assert.equal(
    good.failure,
    undefined,
    `expected success: ${JSON.stringify(good)}`,
  );
  assert.equal(good.postalCode, 'MD-2001');
  assert.equal(good.locality, 'Soroca');
  assert.equal(good.deliveryPriceMinor, null);
});

// ─── Test 7: courier price from shop_settings ────────────────────────────────

test('after setting courier_price_minor, courier order has correct delivery and total', async () => {
  await restock();
  await db.query('UPDATE shop_settings SET courier_price_minor = 5000');

  await setItem(customer, variantA, 1);

  const result = await place(customer, {
    deliveryMethod: 'courier',
    recipientName: 'Ion Popescu',
    phone: '069 123 456',
    address: 'str. Pushkin 1, ap. 5',
  });

  assert.equal(
    result.failure,
    undefined,
    `expected success: ${JSON.stringify(result)}`,
  );
  assert.equal(result.deliveryPriceMinor, 5000);
  assert.equal(result.totalMinor, result.itemsTotalMinor + 5000);

  // Reset
  await db.query('UPDATE shop_settings SET courier_price_minor = NULL');
});

// ─── Test 8: edge cases ──────────────────────────────────────────────────────

test('empty cart → CART_EMPTY; archived product in cart → ITEM_UNAVAILABLE', async () => {
  // Fresh customer with empty cart
  const c = (
    await db.query(
      "INSERT INTO users(email,password_hash) VALUES('edge@example.test','x') RETURNING id",
    )
  ).rows[0].id;

  const emptyResult = await place(c, {
    deliveryMethod: 'courier',
    recipientName: 'Test User',
    phone: '069 000 000',
    address: 'str. Test 1, ap. 1',
  });
  assert.equal(emptyResult.failure, 'CART_EMPTY');

  // Add a product, then archive it
  const archProd = (
    await db.query(
      "INSERT INTO products(slug,status) VALUES('arch-prod','active') RETURNING id",
    )
  ).rows[0].id;
  const archVar = (
    await db.query(
      "INSERT INTO product_variants(product_id,sku,name,price_minor) VALUES($1,'ARCH-1','Item',1000) RETURNING id",
      [archProd],
    )
  ).rows[0].id;
  await db.query(
    'INSERT INTO inventory_balances(warehouse_id,variant_id,on_hand) VALUES($1,$2,5)',
    [warehouseMain, archVar],
  );

  // Set item while product is active
  await db.query('SELECT customer_cart_set_item($1,$2,1,$3)', [
    c,
    archVar,
    'ru',
  ]);

  // Now archive the product
  await db.query("UPDATE products SET status='archived' WHERE id=$1", [
    archProd,
  ]);

  const unavailable = await place(c, {
    deliveryMethod: 'courier',
    recipientName: 'Test User',
    phone: '069 000 000',
    address: 'str. Test 1, ap. 1',
  });
  assert.equal(unavailable.failure, 'ITEM_UNAVAILABLE');
});

// ─── Test 9: cancellation ────────────────────────────────────────────────────

test('cancel: other customer NOT_FOUND; owner cancels, stock released, idempotent; confirmed → ORDER_NOT_CANCELLABLE', async () => {
  await restock();
  // Create a fresh customer for cancel tests
  const c = (
    await db.query(
      "INSERT INTO users(email,password_hash) VALUES('cancel@example.test','x') RETURNING id",
    )
  ).rows[0].id;

  // Set cart items
  await db.query('SELECT customer_cart_set_item($1,$2,1,$3)', [
    c,
    variantA,
    'ru',
  ]);

  const ord = await place(c, {
    deliveryMethod: 'courier',
    recipientName: 'Cancel User',
    phone: '069 111 222',
    address: 'str. Cancel 1, ap. 1',
  });
  assert.equal(ord.failure, undefined, `place failed: ${JSON.stringify(ord)}`);
  const orderId = ord.id;

  // Other customer gets NOT_FOUND
  const notFound = (
    await db.query('SELECT order_cancel($1,$2) AS r', [otherCustomer, orderId])
  ).rows[0].r;
  assert.equal(notFound.failure, 'NOT_FOUND');

  // Record reserved before cancel
  const beforeReserved = (
    await db.query(
      'SELECT sum(reserved)::int AS r FROM inventory_balances WHERE variant_id=$1',
      [variantA],
    )
  ).rows[0].r;

  // Owner cancels
  const cancelled = (
    await db.query('SELECT order_cancel($1,$2) AS r', [c, orderId])
  ).rows[0].r;
  assert.equal(cancelled.status, 'cancelled');

  // Reserved stock went back
  const afterReserved = (
    await db.query(
      'SELECT sum(reserved)::int AS r FROM inventory_balances WHERE variant_id=$1',
      [variantA],
    )
  ).rows[0].r;
  assert.ok(afterReserved < beforeReserved);

  // Reservation is released
  const resId = (
    await db.query('SELECT reservation_id FROM orders WHERE id=$1', [orderId])
  ).rows[0].reservation_id;
  const resStatus = (
    await db.query('SELECT status FROM inventory_reservations WHERE id=$1', [
      resId,
    ])
  ).rows[0].status;
  assert.equal(resStatus, 'released');

  // History has 'new' then 'cancelled'
  const history = cancelled.history;
  assert.equal(history[0].status, 'new');
  assert.equal(history[1].status, 'cancelled');

  // Cancelling again returns same document without double-releasing
  const reservedAfterFirstCancel = (
    await db.query(
      'SELECT sum(reserved)::int AS r FROM inventory_balances WHERE variant_id=$1',
      [variantA],
    )
  ).rows[0].r;

  const again = (
    await db.query('SELECT order_cancel($1,$2) AS r', [c, orderId])
  ).rows[0].r;
  assert.equal(again.status, 'cancelled');
  assert.equal(again.id, orderId);

  const reservedAfterSecondCancel = (
    await db.query(
      'SELECT sum(reserved)::int AS r FROM inventory_balances WHERE variant_id=$1',
      [variantA],
    )
  ).rows[0].r;
  assert.equal(reservedAfterSecondCancel, reservedAfterFirstCancel);

  // Set status to 'confirmed' → ORDER_NOT_CANCELLABLE
  const c2 = (
    await db.query(
      "INSERT INTO users(email,password_hash) VALUES('cancel2@example.test','x') RETURNING id",
    )
  ).rows[0].id;
  await db.query('SELECT customer_cart_set_item($1,$2,1,$3)', [
    c2,
    variantA,
    'ru',
  ]);
  const ord2 = await place(c2, {
    deliveryMethod: 'courier',
    recipientName: 'Cancel 2',
    phone: '069 333 444',
    address: 'str. Cancel 2, ap. 2',
  });
  assert.equal(ord2.failure, undefined);

  await db.query("UPDATE orders SET status='confirmed' WHERE id=$1", [ord2.id]);
  const notCancellable = (
    await db.query('SELECT order_cancel($1,$2) AS r', [c2, ord2.id])
  ).rows[0].r;
  assert.equal(notCancellable.failure, 'ORDER_NOT_CANCELLABLE');
});

// ─── Test 10: customer_orders_document ──────────────────────────────────────

test('customer_orders_document lists only own orders, newest first', async () => {
  await restock();
  // Create two fresh customers
  const ca = (
    await db.query(
      "INSERT INTO users(email,password_hash) VALUES('list-a@example.test','x') RETURNING id",
    )
  ).rows[0].id;
  const cb = (
    await db.query(
      "INSERT INTO users(email,password_hash) VALUES('list-b@example.test','x') RETURNING id",
    )
  ).rows[0].id;

  // ca places two orders, cb places one
  await db.query('SELECT customer_cart_set_item($1,$2,1,$3)', [
    ca,
    variantA,
    'ru',
  ]);
  const o1 = await place(ca, {
    deliveryMethod: 'courier',
    recipientName: 'List A',
    phone: '069 100 001',
    address: 'str. List 1, ap. 1',
  });
  assert.equal(o1.failure, undefined);

  await db.query('SELECT customer_cart_set_item($1,$2,1,$3)', [
    ca,
    variantA,
    'ru',
  ]);
  const o2 = await place(ca, {
    deliveryMethod: 'courier',
    recipientName: 'List A',
    phone: '069 100 002',
    address: 'str. List 2, ap. 2',
  });
  assert.equal(o2.failure, undefined);

  await db.query('SELECT customer_cart_set_item($1,$2,1,$3)', [
    cb,
    variantA,
    'ru',
  ]);
  const o3 = await place(cb, {
    deliveryMethod: 'courier',
    recipientName: 'List B',
    phone: '069 200 001',
    address: 'str. List B 1, ap. 1',
  });
  assert.equal(o3.failure, undefined);

  const listA = (
    await db.query('SELECT customer_orders_document($1) AS r', [ca])
  ).rows[0].r;

  // Only ca's orders
  const aIds = listA.items.map((i) => i.id);
  assert.ok(aIds.includes(o1.id));
  assert.ok(aIds.includes(o2.id));
  assert.ok(!aIds.includes(o3.id));

  // Newest first: o2 came after o1
  assert.equal(listA.items[0].id, o2.id);
  assert.equal(listA.items[1].id, o1.id);

  // cb's list has only o3
  const listB = (
    await db.query('SELECT customer_orders_document($1) AS r', [cb])
  ).rows[0].r;
  assert.equal(listB.items.length, 1);
  assert.equal(listB.items[0].id, o3.id);
});

test('missing delivery method or locale is rejected before anything is reserved', async () => {
  await restock();
  await setItem(customer, variantA, 1);
  assert.equal(
    (
      await place(customer, {
        recipientName: 'Ion Popescu',
        phone: '069123456',
      })
    ).failure,
    'INVALID_DELIVERY',
  );
  const key = randomUUID();
  const result = await db.query(
    'SELECT order_place($1,$2,$3::jsonb,NULL) AS r',
    [customer, key, JSON.stringify({ deliveryMethod: 'courier' })],
  );
  assert.equal(result.rows[0].r.failure, 'INVALID_LOCALE');
  await db.query('SELECT customer_cart_remove_item($1,$2,$3)', [
    customer,
    variantA,
    'ru',
  ]);
});
