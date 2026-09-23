import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

// Only for the local/CI Compose project. Values below are generated UUIDs, never
// user input. psql executes inside the database container, with no exposed port.
const query = (sql) =>
  execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'sh',
      '-c',
      'exec psql -X -q -t -A -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
    ],
    { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  ).trim();
const id = randomUUID();
try {
  query(`INSERT INTO outbox_events (id, event_type, aggregate_id, payload)
    VALUES ('${id}', 'FOUNDATION_PROBE', '${randomUUID()}', '{}');`);
  let result = '';
  for (let attempt = 0; attempt < 15; attempt++) {
    result =
      query(`SELECT attempts || ':' || coalesce(last_error_code, '') || ':' ||
      (processed_at IS NULL)::text FROM outbox_events WHERE id = '${id}';`);
    if (result.startsWith('1:')) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(result, '1:UNHANDLED_EVENT_TYPE:true');
  query(
    `UPDATE outbox_events SET attempts = 4, available_at = now() WHERE id = '${id}';`,
  );
  for (let attempt = 0; attempt < 15; attempt++) {
    result =
      query(`SELECT attempts || ':' || (dead_lettered_at IS NOT NULL)::text || ':' ||
      (processed_at IS NULL)::text FROM outbox_events WHERE id = '${id}';`);
    if (result.startsWith('5:')) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(result, '5:true:true');
  console.log(
    'Outbox probe passed: unknown event deferred, then parked without acknowledgement.',
  );
} finally {
  query(
    `DELETE FROM outbox_events WHERE id = '${id}' AND event_type = 'FOUNDATION_PROBE';`,
  );
}
