# Inventory reservations and transactional outbox

Status: accepted for foundation, 2026-09-22.

## Context

Checkout must prevent overselling and avoid lost business events.

## Decision

Future checkout commits atomic per-warehouse reservations, orders and events in PostgreSQL. Workers use SKIP LOCKED and idempotent handlers.

## Alternatives

Read-then-write stock checks race; publishing only after commit can lose events; Redis locking does not establish database correctness.

## Consequences

Foundation includes the outbox schema and worker poller, not checkout. Unknown events are deferred and parked, never acknowledged. Expiry, stable lock order, idempotency keys and concurrency tests are acceptance gates for commerce.
