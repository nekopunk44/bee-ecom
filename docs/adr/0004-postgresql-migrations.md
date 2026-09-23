# PostgreSQL and immutable migrations

Status: accepted for foundation, 2026-09-22.

## Context

Commerce requires durable transactions, concurrency controls and reproducible schema.

## Decision

PostgreSQL 17 is the source of truth. Serialize checksum-verified SQL migrations with a session advisory lock and per-file transactions.

## Alternatives

Schema auto-sync and manual production edits are not reproducible; Redis cannot own core records.

## Consequences

Runtime roles must be separated from the migrator before staging. Migration rollback is an explicit forward change or backup restore.
