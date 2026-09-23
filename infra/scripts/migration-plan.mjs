import { createHash } from 'node:crypto';

export function planMigrations(files, history) {
  const known = new Map(history.map((row) => [row.version, row.checksum]));
  const names = new Set(files.map((file) => file.name));
  for (const row of history) {
    if (!names.has(row.version))
      throw new Error(`Applied migration is missing: ${row.version}`);
  }
  const latest = [...known.keys()].sort().at(-1) ?? '';
  return [...files]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((file) => {
      if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(file.name))
        throw new Error(`Invalid migration name: ${file.name}`);
      const checksum = createHash('sha256').update(file.sql).digest('hex');
      if (known.has(file.name) && known.get(file.name) !== checksum)
        throw new Error(`Applied migration changed: ${file.name}`);
      if (!known.has(file.name) && file.name < latest)
        throw new Error(`Out-of-order migration: ${file.name}`);
      return { ...file, checksum, applied: known.has(file.name) };
    });
}
