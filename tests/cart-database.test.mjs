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
