# ADR 0012: Staff order lifecycle

Status: Accepted

## Context

Staff need to move customer orders through a defined lifecycle in the admin
workspace. The lifecycle must prevent two operators from acting on the same
order simultaneously, record every change for audit, update stock when goods
leave the warehouse, and expose the order list and detail through three admin
endpoints.

## Decision

The order lifecycle is implemented in migration `0007_order_management.sql` and
the `orders::Service::transition` C++ handler.

**Statuses and allowed transitions**

```
new → confirmed → ready → shipped → completed
ready → completed (pickup)
new, confirmed, ready → cancelled
```

The function `order_transition_allowed` encodes this graph. A transition
request supplies the status the operator saw (`from`) and the desired target
(`to`). The database function `order_transition` acquires a row lock on the
order, validates that `from` still matches the current status, and checks the
transition against `order_transition_allowed`.

**Concurrency control**

If `from` is missing or no longer matches the stored status, the function
returns `ORDER_STATUS_CHANGED` (HTTP 409). If the order is already in the
target status and the operator expected a different status, the request is
treated as a duplicate click or retry and the order document is returned
unchanged. An invalid edge in the graph returns `INVALID_TRANSITION` (HTTP 409).

**Stock movements**

When an order reaches `shipped` (courier or post) or `completed` (pickup),
`order_fulfil_stock` writes a `sale` movement for each reserved item, decreases
`on_hand` and `reserved` on the corresponding `inventory_balances` rows, and
marks the reservation `fulfilled`. Cancelling an order from `new`, `confirmed`
or `ready` calls `order_release_stock`, which releases the reservation (marks it
`released`, decrements `reserved` balances, and writes `release` movements).

**Delivery price and tracking number**

The delivery price (in minor currency units) is accepted only when confirming
a courier or post order; it is stored on the order as `delivery_price_minor`.
The tracking number is accepted only when shipping an order; it is stored as
`tracking_number`. Both are validated in `order_transition` and rejected with
`INVALID_DELIVERY_PRICE` or `INVALID_TRACKING_NUMBER` if supplied at the wrong
step or with an invalid format.

**Permissions and origin**

Three endpoints are exposed under `/api/v1/admin/orders`:

- `GET /api/v1/admin/orders` — list with filtering and pagination
- `GET /api/v1/admin/orders/{id}` — single order detail
- `POST /api/v1/admin/orders/{id}/status` — transition

Listing and detail require the `orders.read` permission (granted to `ADMIN`,
`MANAGER`, `WAREHOUSE_OPERATOR`). Transition requires `orders.manage`
(granted to `ADMIN`, `MANAGER`) and an admin origin header; the C++ handler
enforces this with `auth->requireOrigin`.

**Audit and events**

Every successful transition writes three records in the same transaction:

1. An `order_events` row with the order id, new status, and actor id.
2. An `outbox_events` row with `event_type = 'order.status_changed'`,
   the order id, and a payload containing `orderId`, `number`, `from`, `to`.
3. An `audit_logs` row with the actor, action `order.<target>`, entity id,
   correlation id (the request id from the client), and a `changes` object
   holding `from`, `to`, `deliveryPriceMinor` (if provided), and
   `trackingNumber` (if provided).

## Consequences

- Operators cannot overwrite each other's changes; a stale `from` value
  yields a 409 that forces a refresh.
- Stock is decremented exactly once when the order leaves the warehouse;
  cancelling before that point restores availability.
- The delivery price is fixed at confirmation and the tracking number at
  shipping; neither can be changed later through the transition endpoint.
- The outbox event enables downstream consumers (notifications, analytics)
  to react to status changes reliably.
- The audit log records who did what and when, with the correlation id
  linking back to the HTTP request.
