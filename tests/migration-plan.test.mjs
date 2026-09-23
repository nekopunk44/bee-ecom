import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planMigrations } from '../infra/scripts/migration-plan.mjs';

const first = {
  name: '0001_foundation.sql',
  sql: 'CREATE TABLE example (id int);\n',
};
const second = {
  name: '0002_catalog.sql',
  sql: 'ALTER TABLE example ADD COLUMN name text;\n',
};
test('orders new migrations and skips immutable applied migrations', () => {
  const plan = planMigrations([second, first], []);
  assert.deepEqual(
    plan.map((entry) => entry.name),
    [first.name, second.name],
  );
  const again = planMigrations(
    [first, second],
    [{ version: first.name, checksum: plan[0].checksum }],
  );
  assert.equal(again[0].applied, true);
  assert.equal(again[1].applied, false);
});
test('rejects changed or removed applied migrations', () => {
  const [migration] = planMigrations([first], []);
  const history = [{ version: first.name, checksum: migration.checksum }];
  assert.throws(
    () => planMigrations([{ ...first, sql: 'SELECT 1;' }], history),
    /changed/,
  );
  assert.throws(() => planMigrations([], history), /missing/);
});
test('rejects late insertion before applied history and invalid names', () => {
  const [migration] = planMigrations([second], []);
  assert.throws(
    () =>
      planMigrations(
        [first, second],
        [{ version: second.name, checksum: migration.checksum }],
      ),
    /Out-of-order/,
  );
  assert.throws(
    () => planMigrations([{ ...first, name: '../escape.sql' }], []),
    /Invalid/,
  );
});
