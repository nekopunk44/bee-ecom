# Current implementation status — 2026-11-18

The repository contains the foundation, catalog, and commerce increments for
inventory, cart, and orders. The public storefront and admin catalog are usable;
the admin also supports warehouse setup and audited, idempotent stock
adjustments. The storefront supports customer registration, login and logout
with server-side sessions, and a persistent cart.

The inventory increment is migration `0004_inventory.sql`. It adds warehouse
balances, an append-only movement history, inventory permissions, the atomic
`inventory_adjust` SQL use case, and an availability projection. REST routes and
an admin workspace manage warehouses and stock. The migration also has database
primitives for multi-warehouse reservations, replay-safe release and bounded
expiry batches. The worker processes expiry batches. The design is recorded in
[ADR 0011](../adr/0011-inventory-ledger.md).

Customer registration creates only the `CUSTOMER` role and its revocable
session atomically. Registration and authentication accept configured trusted
storefront/admin origins; privileged writes remain admin-origin guarded.

The cart is implemented end to end: migration `0005_customer_cart.sql`, the
authenticated `/api/v1/cart`, `/api/v1/cart/items` and
`/api/v1/cart/items/{variantId}` endpoints, and the storefront cart page
(`apps/storefront/src/pages/[locale]/cart.astro`).

Orders are described from migration `0006_orders.sql` and the contract:
`checkout_document`, `order_place` (courier, pickup and post delivery, an
idempotency key, stock reserved in the same transaction as the order, the cart
emptied), the customer's order history and cancellation that releases stock,
exposed through `/api/v1/checkout`, `/api/v1/orders`, `/api/v1/orders/{orderId}`
and `/api/v1/orders/{orderId}/cancel`.

What does not exist yet: the storefront checkout and order history UI, and
payment and delivery adapters.

The local Windows environment has Node.js and can run frontend and PGlite SQL
checks. Docker, CMake and a C++ compiler are not installed, and the user
declined Linux/WSL/Docker installation. Native API builds and real PostgreSQL
concurrency/container checks must therefore run in CI or another equipped
host. A successful SQL migration test is not a substitute for those checks.

Next work: storefront checkout and order pages, then payment and delivery
adapters. Do not present those flows as implemented until their API, frontend
and integration acceptance checks pass.
