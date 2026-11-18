import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
let customer, otherCustomer, variant;

before(async () => {
  const directory = new URL('../database/migrations/', import.meta.url);
  for (const name of (await readdir(directory))
    .filter((file) => file.endsWith('.sql'))
    .sort())
    await db.exec(await readFile(new URL(name, directory), 'utf8'));
  customer = (
    await db.query(
      "INSERT INTO users(email,password_hash) VALUES('cart-test@example.test','test') RETURNING id",
    )
  ).rows[0].id;
  otherCustomer = (
    await db.query(
      "INSERT INTO users(email,password_hash) VALUES('cart-other@example.test','test') RETURNING id",
    )
  ).rows[0].id;
  const product = (
    await db.query(
      "INSERT INTO products(slug,status) VALUES('cart-honey','active') RETURNING id",
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO product_translations(product_id,locale,name) VALUES($1,'ru','Липовый мёд'),($1,'ro','Miere de tei')",
    [product],
  );
  variant = (
    await db.query(
      "INSERT INTO product_variants(product_id,sku,name,price_minor) VALUES($1,'CART-1','500 g',12500) RETURNING id",
      [product],
    )
  ).rows[0].id;
  const warehouse = (
    await db.query(
      "INSERT INTO warehouses(code,name) VALUES('cart-main','Cart main') RETURNING id",
    )
  ).rows[0].id;
  await db.query(
    'INSERT INTO inventory_balances(warehouse_id,variant_id,on_hand) VALUES($1,$2,7)',
    [warehouse, variant],
  );
});
after(() => db.close());

const get = (owner, locale = 'ru') =>
  db
    .query('SELECT customer_cart_document($1,$2) AS cart', [owner, locale])
    .then((result) => result.rows[0].cart);
const set = (owner, item, locale = 'ru') =>
  db
    .query('SELECT customer_cart_set_item($1,$2,$3,$4) AS cart', [
      owner,
      item,
      2,
      locale,
    ])
    .then((result) => result.rows[0].cart);
const setItem = (owner, item, amount, locale = 'ru') =>
  db
    .query('SELECT customer_cart_set_item($1,$2,$3,$4) AS cart', [
      owner,
      item,
      amount,
      locale,
    ])
    .then((result) => result.rows[0].cart);
const removeItem = (owner, item, locale = 'ru') =>
  db
    .query('SELECT customer_cart_remove_item($1,$2,$3) AS cart', [
      owner,
      item,
      locale,
    ])
    .then((result) => result.rows[0].cart);

test('customer cart is persistent, owner-scoped, localized and uses current price and availability', async () => {
  assert.deepEqual(await get(customer), { items: [] });
  const russian = await set(customer, variant);
  assert.deepEqual(russian.items, [
    {
      variantId: variant,
      productSlug: 'cart-honey',
      sku: 'CART-1',
      name: 'Липовый мёд',
      variantName: '500 g',
      quantity: 2,
      unitPriceMinor: 12500,
      currency: 'MDL',
      available: 7,
    },
  ]);
  assert.deepEqual(await get(otherCustomer), { items: [] });
  assert.equal((await get(customer, 'ro')).items[0].name, 'Miere de tei');
  assert.deepEqual(
    (
      await db.query('SELECT customer_cart_set_item($1,$2,0,$3) AS cart', [
        customer,
        variant,
        'ru',
      ])
    ).rows[0].cart,
    { failure: 'INVALID_CART_ITEM' },
  );
  await db.query('UPDATE product_variants SET price_minor=13000 WHERE id=$1', [
    variant,
  ]);
  const updated = await set(customer, variant);
  assert.equal(updated.items[0].quantity, 2);
  assert.equal(updated.items[0].unitPriceMinor, 13000);
  await db.query(
    "UPDATE products SET status='archived' WHERE slug='cart-honey'",
  );
  assert.deepEqual(
    (
      await db.query('SELECT customer_cart_set_item($1,$2,1,$3) AS cart', [
        customer,
        variant,
        'ru',
      ])
    ).rows[0].cart,
    { failure: 'ITEM_UNAVAILABLE' },
  );
  assert.equal((await get(customer)).items[0].available, 0);
});

test('customer_cart_set_item enforces quantity limits and validates locale', async () => {
  const customer = (
    await db.query(
      "INSERT INTO users(email,password_hash) VALUES('cart-qty@example.test','test') RETURNING id",
    )
  ).rows[0].id;
  const product = (
    await db.query(
      "INSERT INTO products(slug,status) VALUES('cart-pollen','active') RETURNING id",
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO product_translations(product_id,locale,name) VALUES($1,'ru','Цветочная пыльца'),($1,'ro','Polen de flori')",
    [product],
  );
  const variant = (
    await db.query(
      "INSERT INTO product_variants(product_id,sku,name,price_minor) VALUES($1,'POLLEN-1','250 g',8000) RETURNING id",
      [product],
    )
  ).rows[0].id;
  const warehouse = (
    await db.query(
      "INSERT INTO warehouses(code,name) VALUES('cart-qty-wh','Cart quantity warehouse') RETURNING id",
    )
  ).rows[0].id;
  await db.query(
    'INSERT INTO inventory_balances(warehouse_id,variant_id,on_hand) VALUES($1,$2,150)',
    [warehouse, variant],
  );

  const cart = await setItem(customer, variant, 100);
  assert.equal(cart.items[0].quantity, 100);

  assert.deepEqual(await setItem(customer, variant, 101), {
    failure: 'INVALID_CART_ITEM',
  });

  assert.deepEqual(await setItem(customer, variant, 100, 'en'), {
    failure: 'INVALID_LOCALE',
  });
});

test('customer_cart_remove_item removes item only for caller and handles missing item or invalid locale', async () => {
  const customer1 = (
    await db.query(
      "INSERT INTO users(email,password_hash) VALUES('cart-rm-1@example.test','test') RETURNING id",
    )
  ).rows[0].id;
  const customer2 = (
    await db.query(
      "INSERT INTO users(email,password_hash) VALUES('cart-rm-2@example.test','test') RETURNING id",
    )
  ).rows[0].id;
  const product = (
    await db.query(
      "INSERT INTO products(slug,status) VALUES('cart-propolis','active') RETURNING id",
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO product_translations(product_id,locale,name) VALUES($1,'ru','Прополис'),($1,'ro','Propolis')",
    [product],
  );
  const variant1 = (
    await db.query(
      "INSERT INTO product_variants(product_id,sku,name,price_minor) VALUES($1,'PROP-1','50 ml',5000) RETURNING id",
      [product],
    )
  ).rows[0].id;
  const variant2 = (
    await db.query(
      "INSERT INTO product_variants(product_id,sku,name,price_minor) VALUES($1,'PROP-2','100 ml',9000) RETURNING id",
      [product],
    )
  ).rows[0].id;
  const warehouse = (
    await db.query(
      "INSERT INTO warehouses(code,name) VALUES('cart-rm-wh','Cart remove warehouse') RETURNING id",
    )
  ).rows[0].id;
  await db.query(
    'INSERT INTO inventory_balances(warehouse_id,variant_id,on_hand) VALUES($1,$2,20),($1,$3,20)',
    [warehouse, variant1, variant2],
  );

  await setItem(customer1, variant1, 2);
  await setItem(customer2, variant1, 3);

  const initialCart1 = await get(customer1);
  assert.equal(initialCart1.items.length, 1);
  assert.equal(initialCart1.items[0].variantId, variant1);

  // Variant not in cart returns cart unchanged
  const unchangedCart = await removeItem(customer1, variant2);
  assert.deepEqual(unchangedCart, initialCart1);

  // Invalid locale returns INVALID_CART_ITEM
  assert.deepEqual(await removeItem(customer1, variant1, 'en'), {
    failure: 'INVALID_CART_ITEM',
  });

  // Removing variant from caller cart leaves other customer's cart intact
  const removedCart = await removeItem(customer1, variant1);
  assert.deepEqual(removedCart, { items: [] });
  assert.deepEqual(await get(customer1), { items: [] });

  const cart2 = await get(customer2);
  assert.equal(cart2.items.length, 1);
  assert.equal(cart2.items[0].variantId, variant1);
  assert.equal(cart2.items[0].quantity, 3);
});

test('cart limit of 50 distinct variants prevents adding 51st variant but permits quantity update', async () => {
  const customer = (
    await db.query(
      "INSERT INTO users(email,password_hash) VALUES('cart-limit@example.test','test') RETURNING id",
    )
  ).rows[0].id;
  const product = (
    await db.query(
      "INSERT INTO products(slug,status) VALUES('cart-bulk','active') RETURNING id",
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO product_translations(product_id,locale,name) VALUES($1,'ru','Инвентарь'),($1,'ro','Inventar')",
    [product],
  );
  const warehouse = (
    await db.query(
      "INSERT INTO warehouses(code,name) VALUES('cart-limit-wh','Cart limit warehouse') RETURNING id",
    )
  ).rows[0].id;

  const variants = (
    await db.query(
      `INSERT INTO product_variants(product_id,sku,name,price_minor)
       SELECT $1, 'BULK-' || s, 'Variant ' || s, 1000
       FROM generate_series(1, 51) AS s
       RETURNING id`,
      [product],
    )
  ).rows.map((row) => row.id);

  await db.query(
    `INSERT INTO inventory_balances(warehouse_id,variant_id,on_hand)
     SELECT $1, id, 10 FROM product_variants WHERE product_id = $2`,
    [warehouse, product],
  );

  for (let i = 0; i < 50; i++) {
    await setItem(customer, variants[i], 1);
  }

  const fullCart = await get(customer);
  assert.equal(fullCart.items.length, 50);

  // Adding 51st distinct variant returns CART_LIMIT_REACHED
  assert.deepEqual(await setItem(customer, variants[50], 1), {
    failure: 'CART_LIMIT_REACHED',
  });

  // Changing quantity of one of the 50 existing variants succeeds
  const updatedCart = await setItem(customer, variants[0], 5);
  assert.equal(updatedCart.items.length, 50);
  const updatedItem = updatedCart.items.find(
    (item) => item.variantId === variants[0],
  );
  assert.equal(updatedItem?.quantity, 5);
});
