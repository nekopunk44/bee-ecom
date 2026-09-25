# Current implementation status — 2026-09-24

The repository contains the foundation, catalog, and the commerce inventory
increment. The public storefront and admin catalog are usable; the admin also
supports warehouse setup and audited, idempotent stock adjustments. The
storefront supports customer registration, login and logout with server-side
sessions. Customer purchase and checkout flows are not yet available.

The inventory increment is migration `0004_inventory.sql`. It adds warehouse
balances, an append-only movement history, inventory permissions, the atomic
`inventory_adjust` SQL use case, and an availability projection. REST routes
and an admin workspace manage warehouses and stock. The migration also has
database primitives for multi-warehouse reservations, replay-safe release and
bounded expiry batches. The worker processes expiry batches; customer checkout
is not yet connected. The design is recorded in
[ADR 0011](../adr/0011-inventory-ledger.md).

Customer registration creates only the `CUSTOMER` role and its revocable
session atomically. Registration and authentication accept configured trusted
storefront/admin origins; privileged writes remain admin-origin guarded. The
new `0005_customer_cart.sql` migration adds owner-scoped persistent cart storage
and database read/update functions. The REST API and customer-facing cart UI are
the next implementation step; this storage is not checkout or an inventory
reservation.

The local Windows environment has Node.js and can run frontend and PGlite SQL
checks. Docker, CMake and a C++ compiler are not installed, and the user
declined Linux/WSL/Docker installation. Native API builds and real PostgreSQL
concurrency/container checks must therefore run in CI or another equipped
host. A successful SQL migration test is not a substitute for those checks.

Next commerce work: expose the persistent cart through authenticated REST
endpoints and the storefront UI, then create orders and outbox events with
inventory reservations in one transaction, and add payment/delivery adapters.
Do not present those flows as implemented until their API, frontend and
integration acceptance checks pass.
