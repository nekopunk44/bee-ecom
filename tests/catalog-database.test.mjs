import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
let actor, category, product;
const source = await readFile(
  new URL(
    '../services/api/src/modules/catalog/CatalogRepository.cpp',
    import.meta.url,
  ),
  'utf8',
);
const sql = [...source.matchAll(/R"SQL\(([\s\S]*?)\)SQL"/g)].map(
  (match) => match[1],
);
const draft = () => ({
  slug: 'dadan-test',
  status: 'active',
  brandId: null,
  categoryIds: [category],
  translations: {
    ru: {
      name: 'Улей Дадан',
      description: 'Деревянный улей для пасеки',
      seoTitle: '',
      seoDescription: '',
    },
    ro: {
      name: 'Stup Dadant',
      description: 'Stup din lemn',
      seoTitle: '',
      seoDescription: '',
    },
  },
  variants: [
    {
      sku: 'TEST-DADAN-10',
      name: '10 рамок',
      priceMinor: 125050,
      active: true,
      attributes: {},
    },
  ],
  mediaIds: [],
});
async function save(value, id = null, revision = null) {
  return (
    await db.query(
      'SELECT catalog_save($1::jsonb,$2::uuid,$3::uuid,$4::uuid,$5::integer) AS document',
      [JSON.stringify(value), actor, randomUUID(), id, revision],
    )
  ).rows[0].document;
}
before(async () => {
  const directory = new URL('../database/migrations/', import.meta.url);
  for (const name of (await readdir(directory))
    .filter((name) => name.endsWith('.sql'))
    .sort())
    await db.exec(await readFile(new URL(name, directory), 'utf8'));
  actor = (
    await db.query(
      "INSERT INTO users(email,password_hash) VALUES('catalog-test@example.test','unusable-test-hash') RETURNING id",
    )
  ).rows[0].id;
  category = (
    await db.query(sql[3], [
      JSON.stringify({ slug: 'hives', nameRu: 'Ульи', nameRo: 'Stupi' }),
      actor,
      randomUUID(),
    ])
  ).rows[0].id;
});
after(() => db.close());
test('all migrations execute; catalog write preserves translations and integer money', async () => {
  product = await save(draft());
  assert.equal(product.translations.ro.name, 'Stup Dadant');
  assert.equal(product.variants[0].priceMinor, 125050);
  assert.equal(product.revision, 1);
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::int AS count FROM audit_logs WHERE entity_id=$1',
        [product.id],
      )
    ).rows[0].count,
    1,
  );
});
test('actual repository query searches, filters, sorts and paginates public records', async () => {
  const query = (q, cat = '', min = 0, max = 100000000, page = 1) =>
    db.query(sql[0], [
      'ru',
      false,
      q,
      cat,
      '',
      min,
      max,
      'price_asc',
      12,
      (page - 1) * 12,
      page,
    ]);
  assert.equal(
    JSON.parse((await query('Дадан', category)).rows[0].document).total,
    1,
  );
  assert.equal(
    JSON.parse((await query('', '', 125051)).rows[0].document).total,
    0,
  );
  assert.equal(
    JSON.parse((await query('', '', 0, 100000000, 2)).rows[0].document).items
      .length,
    0,
  );
  assert.equal(
    JSON.parse((await query("%' OR 1=1 --")).rows[0].document).total,
    0,
  );
  const metadata = JSON.parse(
    (await db.query(sql[1], ['ro'])).rows[0].document,
  );
  assert.equal(metadata.categories[0].name, 'Stupi');
});
test('stale revision cannot overwrite a product or add an audit record', async () => {
  const changed = draft();
  changed.translations.ru.name = 'Улей после правки';
  changed.variants[0].id = product.variants[0].id;
  const updated = await save(changed, product.id, 1);
  assert.equal(updated.revision, 2);
  const conflict = await save(draft(), product.id, 1);
  assert.equal(conflict.failure, 'REVISION_CONFLICT');
  assert.equal(
    (await db.query('SELECT catalog_document($1) AS document', [product.id]))
      .rows[0].document.translations.ru.name,
    'Улей после правки',
  );
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::int AS count FROM audit_logs WHERE entity_id=$1',
        [product.id],
      )
    ).rows[0].count,
    2,
  );
});
test('duplicate SKU rolls back product creation and audit changes', async () => {
  const duplicate = draft();
  duplicate.slug = 'duplicate-sku';
  const result = await save(duplicate);
  assert.equal(result.failure, 'DUPLICATE_SLUG_OR_SKU');
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS count FROM products WHERE slug='duplicate-sku'",
      )
    ).rows[0].count,
    0,
  );
});
test('foreign variant identity and unknown categories cannot partially update product', async () => {
  const invalid = draft();
  invalid.variants[0].id = randomUUID();
  assert.equal(
    (await save(invalid, product.id, 2)).failure,
    'INVALID_REFERENCE',
  );
  invalid.variants[0].id = product.variants[0].id;
  invalid.categoryIds = [randomUUID()];
  assert.equal(
    (await save(invalid, product.id, 2)).failure,
    'INVALID_REFERENCE',
  );
  assert.equal(
    (await db.query('SELECT revision FROM products WHERE id=$1', [product.id]))
      .rows[0].revision,
    2,
  );
});
test('archived products disappear from the public query but remain in admin', async () => {
  const archived = draft();
  archived.status = 'archived';
  archived.variants[0].id = product.variants[0].id;
  await save(archived, product.id, 2);
  const parameters = [
    'ru',
    false,
    '',
    '',
    '',
    0,
    100000000,
    'newest',
    12,
    0,
    1,
  ];
  assert.equal(
    JSON.parse((await db.query(sql[0], parameters)).rows[0].document).total,
    0,
  );
  parameters[1] = true;
  assert.equal(
    JSON.parse((await db.query(sql[0], parameters)).rows[0].document).total,
    1,
  );
});
