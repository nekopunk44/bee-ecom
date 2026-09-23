# Database migrations

Run `docker compose run --rm migrate` (Compose also runs it before API/worker).
Files are UTF-8, LF, named `NNNN_description.sql` and applied lexicographically.
Every migration runs in its own transaction. A session advisory lock serializes
concurrent runners. `schema_migrations` records filename, SHA-256 and applied time.
The runner rejects changed files, missing history and out-of-order additions.

Do not edit an applied migration. Add a forward migration. Do not put BEGIN,
COMMIT, VACUUM or CREATE INDEX CONCURRENTLY in these transaction-wrapped files.
Use a separately reviewed deployment procedure for online concurrent indexes.

Local Compose uses a single development database account. Before staging create
separate owner/migrator, API and worker roles. API needs business DML but not DDL;
worker needs only its queues and handler-specific tables. Never grant the runtime
superuser privileges. Migration credentials belong to the deployment job only.

For rolling deployments use expand/contract: add compatible schema, deploy code,
backfill, verify, then remove old schema in a later release. Take and test a backup
before destructive migrations. An application rollback does not undo migrations.
