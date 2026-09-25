import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const repositorySource = await readFile(
  new URL(
    '../services/api/src/modules/auth/AuthRepository.cpp',
    import.meta.url,
  ),
  'utf8',
);
const queries = [...repositorySource.matchAll(/R"SQL\(([\s\S]*?)\)SQL"/g)].map(
  (match) => match[1],
);

before(async () => {
  const directory = new URL('../database/migrations/', import.meta.url);
  for (const name of (await readdir(directory))
    .filter((file) => file.endsWith('.sql'))
    .sort())
    await db.exec(await readFile(new URL(name, directory), 'utf8'));
});
after(() => db.close());

test('customer registration assigns only CUSTOMER and creates its session atomically', async () => {
  const query = queries[1];
  const params = ['customer@example.test', 'argon2-test-hash', 'a'.repeat(64)];
  const created = await db.query(query, params);
  assert.equal(created.rows.length, 1);
  const userId = created.rows[0].id;
  assert.equal(created.rows[0].email, params[0]);
  assert.deepEqual(
    (
      await db.query('SELECT role_code FROM user_roles WHERE user_id=$1', [
        userId,
      ])
    ).rows,
    [{ role_code: 'CUSTOMER' }],
  );
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::int AS count FROM sessions WHERE user_id=$1',
        [userId],
      )
    ).rows[0].count,
    1,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS count FROM role_permissions WHERE role_code='CUSTOMER'",
      )
    ).rows[0].count,
    0,
  );

  const duplicate = await db.query(query, [
    params[0],
    'another-hash',
    'b'.repeat(64),
  ]);
  assert.equal(duplicate.rows.length, 0);
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::int AS count FROM sessions WHERE user_id=$1',
        [userId],
      )
    ).rows[0].count,
    1,
  );
});
