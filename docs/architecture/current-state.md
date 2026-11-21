# Current implementation status — 2026-11-18

The repository contains the foundation, catalog, and commerce increments for
inventory, cart, and orders. The public storefront and admin catalog are usable;
the admin also supports warehouse setup and audited, idempotent stock
adjustments. The storefront supports customer registration, login and logout
with server-side sessions, a persistent cart, checkout with payment on delivery,
the order history and cancellation of a new order.

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

Orders come from migration `0006_orders.sql`: `checkout_document` prepares the
checkout, `order_place` places an order (courier, pickup and post delivery, an
idempotency key, stock reserved in the same transaction as the order, the cart
emptied), the customer's order history and cancellation that releases stock,
exposed through `/api/v1/checkout`, `/api/v1/orders`, `/api/v1/orders/{orderId}`
and `/api/v1/orders/{orderId}/cancel`.

Staff order management is added by migration `0007_order_management.sql`. The
admin «Заказы» tab uses three endpoints: `GET /api/v1/admin/orders` (list with
filtering), `GET /api/v1/admin/orders/{id}` (detail), and
`POST /api/v1/admin/orders/{id}/status` (transition). The lifecycle, concurrency
control, stock fulfilment on ship/pickup, delivery price and tracking number,
permissions and audit are described in [ADR 0012](../adr/0012-order-lifecycle.md).

The storefront uses them on `/[locale]/checkout/` (courier, pickup from a
warehouse that holds the whole cart, or post; one idempotency key per attempt),
`/[locale]/orders/` and `/[locale]/orders/<id>/` with cancellation. Browser
tests cover these pages against a mocked API; they have not run against the
real API and PostgreSQL.

What does not exist yet: online payment and delivery-service adapters.

The local Windows environment has Node.js and can run frontend and PGlite SQL
checks. Docker, CMake and a C++ compiler are not installed, and the user
declined Linux/WSL/Docker installation. Native API builds and real PostgreSQL
concurrency/container checks must therefore run in CI or another equipped
host. A successful SQL migration test is not a substitute for those checks.

Next work: an end-to-end checkout check against the real stack in CI, then
payment and delivery adapters. Do not present those flows as implemented until their API, frontend
and integration acceptance checks pass.
