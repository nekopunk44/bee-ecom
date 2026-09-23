import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { planMigrations } from './migration-plan.mjs';

const directory = new URL('../../database/migrations/', import.meta.url);
const client = new pg.Client({
  connectionTimeoutMillis: 5000,
  statement_timeout: 60000,
});
let locked = false;
try {
  for (const key of ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD']) {
    if (!process.env[key]) throw new Error(`Missing ${key}`);
  }
  await client.connect();
  // Fixed application-specific key, on the same session used for all migrations.
  await client.query('SELECT pg_advisory_lock(724301982)');
  locked = true;
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY, checksum char(64) NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const files = await Promise.all(
    (await readdir(directory))
      .filter((name) => name.endsWith('.sql'))
      .map(async (name) => ({
        name,
        sql: await readFile(new URL(name, directory), 'utf8'),
      })),
  );
  const { rows } = await client.query(
    'SELECT version, checksum FROM schema_migrations ORDER BY version',
  );
  for (const migration of planMigrations(files, rows)) {
    if (migration.applied) continue;
    await client.query('BEGIN');
    try {
      await client.query(migration.sql);
      await client.query(
        'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)',
        [migration.name, migration.checksum],
      );
      await client.query('COMMIT');
      console.log(
        JSON.stringify({
          service: 'bee-migrate',
          event: 'applied',
          version: migration.name,
        }),
      );
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} catch {
  // Database errors may expose connection details or SQL; avoid raw exceptions.
  console.error(
    JSON.stringify({ service: 'bee-migrate', event: 'migration_failed' }),
  );
  process.exitCode = 1;
} finally {
  if (locked)
    await client.query('SELECT pg_advisory_unlock(724301982)').catch(() => {});
  await client.end().catch(() => {});
}
