# ADR 0011: PostgreSQL inventory ledger and balance projection

Status: Accepted

## Context

Stock is business-critical and may be split across warehouses. Redis is
disposable and cannot decide whether a sale can be fulfilled. Administrators
also need a traceable explanation for every stock change, while retried HTTP
requests must not apply an adjustment twice.

## Decision

PostgreSQL owns warehouse stock. `inventory_balances` stores the current
per-warehouse, per-variant projection and is locked while applying an
adjustment. `inventory_movements` records the adjustment with a unique request
ID, actor, reason and signed quantity; rows are append-only. The same database
transaction updates the balance, inserts the movement and records the audit
entry. Reusing a request ID with the same adjustment returns the original
result; reusing it with different input reports an idempotency conflict.
Availability is derived as `on_hand - reserved` across active warehouses.

The migration also provides an atomic reservation primitive. It locks all
participating balance rows in a stable order, allocates across active
warehouses, records reservation movements, and stores a bounded expiry. A
request key is serialized with a transaction advisory lock; retries with the
same owner and normalized items replay the existing reservation. Release is
owner-scoped and idempotent. Expiry uses bounded batches with `SKIP LOCKED`.

These database use cases and the expiry batch are wired to the background
worker, but they are not yet connected to customer authentication, cart,
checkout or orders. The storefront must not claim to support purchasing until
that path is implemented and concurrent reservation tests pass against real
PostgreSQL.

## Consequences

- An adjustment cannot lower on-hand stock below reserved stock.
- Durable state remains correct if Redis is cleared or unavailable.
- Movement rows provide a historical record; corrections use compensating
  movements rather than edits.
- Checkout must call reservation from the same transaction that creates an
  order and outbox event; a standalone reservation is only a stock primitive.
- The local PGlite SQL suite verifies migration behavior; row-lock contention
  still requires the real PostgreSQL integration job.
