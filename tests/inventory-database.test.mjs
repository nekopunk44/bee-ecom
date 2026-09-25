import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
let actor, warehouse, variant;

before(async () => {
  const directory = new URL('../database/migrations/', import.meta.url);
  for (const name of (await readdir(directory))
    .filter((file) => file.endsWith('.sql'))
    .sort())
    await db.exec(await readFile(new URL(name, directory), 'utf8'));
  actor = (
    await db.query(
      "INSERT INTO users(email,password_hash) VALUES('inventory-test@example.test','test') RETURNING id",
    )
  ).rows[0].id;
  const category = (
    await db.query(
      "INSERT INTO categories(slug) VALUES('inventory-category') RETURNING id",
    )
  ).rows[0].id;
  const product = (
    await db.query(
      "INSERT INTO products(slug,status) VALUES('inventory-product','active') RETURNING id",
    )
  ).rows[0].id;
  await db.query('INSERT INTO product_categories VALUES($1,$2)', [
    product,
    category,
  ]);
  variant = (
    await db.query(
      "INSERT INTO product_variants(product_id,sku,name,price_minor) VALUES($1,'INVENTORY-1','Test item',100) RETURNING id",
      [product],
    )
  ).rows[0].id;
  warehouse = (
    await db.query(
      "INSERT INTO warehouses(code,name) VALUES('main','Main warehouse') RETURNING id",
    )
  ).rows[0].id;
});
after(() => db.close());

test('inventory adjustment is atomic, auditable, and idempotent', async () => {
  const request = randomUUID();
  const adjust = (delta, id = request, reason = 'Initial receipt') =>
    db
      .query('SELECT inventory_adjust($1,$2,$3,$4,$5,$6) AS result', [
        warehouse,
        variant,
        delta,
        actor,
        id,
        reason,
      ])
      .then((result) => result.rows[0].result);

  assert.deepEqual(await adjust(8), {
    onHand: 8,
    reserved: 0,
    replayed: false,
  });
  assert.deepEqual(await adjust(8), { onHand: 8, reserved: 0, replayed: true });
  assert.deepEqual(await adjust(9), { failure: 'IDEMPOTENCY_CONFLICT' });

  const availability = (
    await db.query('SELECT inventory_availability($1) AS result', [variant])
  ).rows[0].result;
  assert.equal(availability.available, 8);
  assert.deepEqual(availability.warehouses, [{ code: 'main', available: 8 }]);
  await db.query('UPDATE warehouses SET active=false WHERE id=$1', [warehouse]);
  assert.equal(
    (await db.query('SELECT inventory_availability($1) AS result', [variant]))
      .rows[0].result.available,
    0,
  );
  await db.query('UPDATE warehouses SET active=true WHERE id=$1', [warehouse]);
  assert.deepEqual(await adjust(-9, randomUUID(), 'Damaged goods'), {
    failure: 'BELOW_RESERVED',
  });
  await db.query(
    'UPDATE inventory_balances SET reserved=6 WHERE warehouse_id=$1 AND variant_id=$2',
    [warehouse, variant],
  );
  assert.deepEqual(await adjust(-3, randomUUID(), 'Damaged goods'), {
    failure: 'BELOW_RESERVED',
  });
  await db.query(
    'UPDATE inventory_balances SET reserved=0 WHERE warehouse_id=$1 AND variant_id=$2',
    [warehouse, variant],
  );
  await assert.rejects(
    db.query('DELETE FROM inventory_movements WHERE request_id=$1', [request]),
    /append-only/,
  );

  assert.equal(
    (
      await db.query(
        'SELECT on_hand FROM inventory_balances WHERE warehouse_id=$1 AND variant_id=$2',
        [warehouse, variant],
      )
    ).rows[0].on_hand,
    8,
  );
  assert.equal(
    (await db.query('SELECT count(*)::int AS count FROM inventory_movements'))
      .rows[0].count,
    1,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS count FROM audit_logs WHERE action='inventory.adjusted'",
      )
    ).rows[0].count,
    1,
  );
});

test('warehouse permissions follow operator and manager responsibilities', async () => {
  const permissions = (
    await db.query(
      `SELECT role_code, array_agg(permission_code ORDER BY permission_code) AS permissions
       FROM role_permissions WHERE role_code IN ('ADMIN','MANAGER','WAREHOUSE_OPERATOR')
       GROUP BY role_code`,
    )
  ).rows;
  const byRole = Object.fromEntries(
    permissions.map((row) => [row.role_code, row.permissions]),
  );
  assert.ok(byRole.ADMIN.includes('inventory.adjust'));
  assert.ok(byRole.MANAGER.includes('warehouses.manage'));
  assert.ok(!byRole.MANAGER.includes('inventory.adjust'));
  assert.ok(byRole.WAREHOUSE_OPERATOR.includes('inventory.adjust'));
  assert.ok(!byRole.WAREHOUSE_OPERATOR.includes('warehouses.manage'));
});

test('reservations split stock across warehouses, replay safely, release and expire once', async () => {
  const secondWarehouse = (
    await db.query(
      "INSERT INTO warehouses(code,name) VALUES('west','West warehouse') RETURNING id",
    )
  ).rows[0].id;
  await db.query(
    'INSERT INTO inventory_balances(warehouse_id,variant_id,on_hand) VALUES($1,$2,3)',
    [secondWarehouse, variant],
  );
  const request = randomUUID();
  const reserve = (id, quantity) =>
    db
      .query('SELECT inventory_reserve($1,$2::jsonb,$3,900) AS result', [
        id,
        JSON.stringify([{ variantId: variant, quantity }]),
        actor,
      ])
      .then((result) => result.rows[0].result);

  assert.deepEqual(await reserve(randomUUID(), 0), {
    failure: 'INVALID_RESERVATION',
  });
  assert.deepEqual(
    (
      await db.query(
        'SELECT inventory_reserve($1,$2::jsonb,$3,900) AS result',
        [
          randomUUID(),
          JSON.stringify({ variantId: variant, quantity: 1 }),
          actor,
        ],
      )
    ).rows[0].result,
    { failure: 'INVALID_RESERVATION' },
  );
  const created = await reserve(request, 10);
  assert.equal(created.status, 'active');
  assert.equal(created.replayed, false);
  const quantityByWarehouse = Object.fromEntries(
    created.items.map((item) => [item.warehouseId, item.quantity]),
  );
  assert.equal(quantityByWarehouse[warehouse], 8);
  assert.equal(quantityByWarehouse[secondWarehouse], 2);
  assert.deepEqual(await reserve(request, 10), { ...created, replayed: true });
  assert.deepEqual(await reserve(request, 9), {
    failure: 'IDEMPOTENCY_CONFLICT',
  });
  assert.deepEqual(await reserve(randomUUID(), 2), {
    failure: 'INVENTORY_NOT_AVAILABLE',
    variantId: variant,
  });

  const otherActor = (
    await db.query(
      "INSERT INTO users(email,password_hash) VALUES('other-customer@example.test','test') RETURNING id",
    )
  ).rows[0].id;
  assert.deepEqual(
    (
      await db.query('SELECT inventory_release($1,$2) AS result', [
        created.id,
        otherActor,
      ])
    ).rows[0].result,
    { failure: 'NOT_FOUND' },
  );

  const released = (
    await db.query('SELECT inventory_release($1,$2) AS result', [
      created.id,
      actor,
    ])
  ).rows[0].result;
  assert.equal(released.status, 'released');
  assert.equal(
    (
      await db.query(
        'SELECT sum(reserved)::int AS reserved FROM inventory_balances WHERE variant_id=$1',
        [variant],
      )
    ).rows[0].reserved,
    0,
  );

  const expiring = await reserve(randomUUID(), 2);
  await db.query(
    "UPDATE inventory_reservations SET created_at=now()-interval '2 minutes', expires_at=now()-interval '1 second' WHERE id=$1",
    [expiring.id],
  );
  assert.equal(
    (await db.query('SELECT inventory_expire_reservations(10) AS count'))
      .rows[0].count,
    1,
  );
  assert.equal(
    (
      await db.query('SELECT status FROM inventory_reservations WHERE id=$1', [
        expiring.id,
      ])
    ).rows[0].status,
    'expired',
  );
  assert.equal(
    (
      await db.query(
        'SELECT sum(reserved)::int AS reserved FROM inventory_balances WHERE variant_id=$1',
        [variant],
      )
    ).rows[0].reserved,
    0,
  );
  assert.equal(
    (await db.query('SELECT inventory_expire_reservations(10) AS count'))
      .rows[0].count,
    0,
  );
});
