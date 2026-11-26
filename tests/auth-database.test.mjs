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

test('Google sign-in finds, links or creates only customer accounts', async () => {
  const query = queries[3];
  const roles = async (id) =>
    (
      await db.query(
        'SELECT role_code FROM user_roles WHERE user_id=$1 ORDER BY role_code',
        [id],
      )
    ).rows.map((row) => row.role_code);

  // A new person: a customer account with an unusable password and the identity.
  const created = await db.query(query, ['google-1', 'new@example.test']);
  assert.equal(created.rows.length, 1);
  const newId = created.rows[0].id;
  assert.deepEqual(await roles(newId), ['CUSTOMER']);
  assert.equal(
    (await db.query('SELECT password_hash FROM users WHERE id=$1', [newId]))
      .rows[0].password_hash,
    '!external',
  );
  // The same Google subject later finds the same account, even with another email.
  const again = await db.query(query, ['google-1', 'renamed@example.test']);
  assert.equal(again.rows[0].id, newId);

  // A customer who registered with a password is linked by the verified email.
  const customer = (
    await db.query(queries[1], [
      'buyer@example.test',
      'argon2-test-hash',
      'c'.repeat(64),
    ])
  ).rows[0].id;
  const linked = await db.query(query, ['google-2', 'buyer@example.test']);
  assert.equal(linked.rows[0].id, customer);
  assert.equal(
    (
      await db.query(
        "SELECT user_id FROM user_identities WHERE provider='google' AND subject='google-2'",
      )
    ).rows[0].user_id,
    customer,
  );

  // Staff keep the password: their email is never joined to a Google account.
  const staff = (
    await db.query(
      "INSERT INTO users(email,password_hash) VALUES('staff@example.test','argon2-test-hash') RETURNING id",
    )
  ).rows[0].id;
  await db.query("INSERT INTO user_roles VALUES($1,'ADMIN')", [staff]);
  const refused = await db.query(query, ['google-3', 'staff@example.test']);
  assert.equal(refused.rows.length, 0);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS count FROM user_identities WHERE subject='google-3'",
      )
    ).rows[0].count,
    0,
  );
});
