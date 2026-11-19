import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();

before(async () => {
  const directory = new URL('../database/migrations/', import.meta.url);
  for (const name of (await readdir(directory))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await db.exec(await readFile(new URL(name, directory), 'utf8'));
});

after(() => db.close());

describe('order_phone', () => {
  test('normalizes valid Moldovan phone numbers to +37369123456', async () => {
    const inputs = [
      '+373 69 123 456',
      '069123456',
      '69123456',
      '(0 69) 12-34-56',
      '373 69 12 34 56',
    ];
    for (const input of inputs) {
      const result = await db.query('SELECT order_phone($1) AS phone', [input]);
      assert.equal(result.rows[0].phone, '+37369123456', `input: ${input}`);
    }
  });

  test('returns NULL for invalid or non-Moldovan phone numbers', async () => {
    const inputs = [null, '', '12345', '0691234567', '+40 721 234 567'];
    for (const input of inputs) {
      const result = await db.query('SELECT order_phone($1) AS phone', [input]);
      assert.equal(result.rows[0].phone, null, `input: ${input}`);
    }
  });
});

describe('order_clean_text', () => {
  test('returns NULL for NULL and whitespace-only strings', async () => {
    const resultNull = await db.query('SELECT order_clean_text(NULL) AS text');
    assert.equal(resultNull.rows[0].text, null);

    const resultWhitespace = await db.query(
      "SELECT order_clean_text('   ') AS text",
    );
    assert.equal(resultWhitespace.rows[0].text, null);
  });

  test('normalizes text by collapsing whitespace and trimming', async () => {
    const result = await db.query(
      "SELECT order_clean_text(E'  Strada   Ştefan  cel Mare\\n 1 ') AS text",
    );
    assert.equal(result.rows[0].text, 'Strada Ştefan cel Mare 1');
  });
});
