# Architecture

## Runtime and ownership

```text
CDN / WAF / TLS
       |
     Nginx
       |-- storefront host /       -> Astro SSR + selective Svelte 5 islands
       |-- both hosts /api/v1/     -> C++23 / Drogon modular monolith
       `-- admin host /            -> independent Svelte 5 SPA
                                         |
                          PostgreSQL / Redis / S3-compatible storage
                                         |
                             independent outbox worker process
```

The API owns all business state. PostgreSQL is authoritative for identity,
orders, payments, carts, inventory, audit and outbox. Redis is disposable cache
and temporary coordination. MinIO supplies the local S3 interface; production
uses private managed object storage. No production uploads are stored on disk.

Modules follow HTTP controller -> application service -> domain -> repository.
SQL belongs in repositories. Foundation contains only the health module and
shared configuration/HTTP infrastructure. Add domain modules when implementing
their use cases rather than generating empty classes for every proposed module.

Future modules: Auth, Users, Catalog (categories, brands, products, variants,
attributes), Pricing, Cart, Orders, Inventory, Warehouses, Payments, Delivery,
Promotions, Favorites, Compatibility, ApiaryConfigurator, Recommendations,
Notifications, Analytics, Admin and Media. The worker links the same application
modules as the API; it is a deployment process, not a separate microservice.

## Repository and build dependencies

| Path                | Responsibility                                               |
| ------------------- | ------------------------------------------------------------ |
| apps/storefront     | Astro Node SSR, locale routes, Svelte islands                |
| apps/admin          | Svelte/Vite SPA, separate document and routing runtime       |
| services/api        | Drogon controllers, services, repositories, C++23 executable |
| services/worker     | PostgreSQL outbox polling process                            |
| packages/contracts  | OpenAPI source of truth                                      |
| packages/api-client | Generated TypeScript schema + typed fetch client             |
| packages/ui         | Shared CSS tokens and accessible base styles                 |
| database/migrations | Immutable, ordered SQL migrations                            |
| database/seeds      | Explicit non-production sample data only                     |
| infra/docker        | Multi-stage application images                               |
| infra/nginx         | Host routing, request limits and security headers            |
| infra/scripts       | Environment bootstrap, migrations, smoke checks              |
| docs/adr            | Architectural decisions and tradeoffs                        |

Frontend: Node 22.12+ and npm workspaces with a committed lockfile. Backend:
GCC 14+, CMake 3.25+, Drogon 1.9.11 with PostgreSQL, hiredis, OpenSSL and JsonCpp.
Docker builds the C++ toolchain so local native installation is optional.

## Invariants to preserve in subsequent milestones

- Money uses integer minor units and ISO currency (MDL), never floating point.
- RU/RO translations are rows keyed by entity and locale; frontend routes share
  templates and message dictionaries.
- Inventory is per variant and warehouse; available = on_hand - reserved.
  Atomic conditional updates and row locks live in the order transaction.
  Reservations expire through a worker, with release and capture idempotent.
- Order records, reservations, status history and outbox events commit together.
  Checkout idempotency keys have a database uniqueness constraint.
- Lock inventory rows in a stable warehouse/variant order to avoid deadlocks.
- Compatibility and configurator rules are server-owned, deterministic,
  versioned and explainable. No external LLM in core purchase decisions.
- RBAC is enforced in API services. A hidden admin control is not authorization.
- Auth will use Argon2id and rotating, revocable HttpOnly refresh cookies;
  privileged operations require CSRF defenses and server-side permissions.
- Public HTML remains readable without JavaScript. No sensitive session state
  or auth tokens in localStorage; no caching checkout or payment requests.

## Foundation operations

Liveness tests the process only. Readiness tests PostgreSQL schema and Redis
with bounded timeouts, returning 503 without connection details on failure.
Every API response carries a server-generated correlation UUID. JSON access
logs omit query strings, bodies, cookies and credentials. Nginx does not trust
client-provided forwarding or correlation headers.

Outbox polling uses row locks with SKIP LOCKED. The initial worker has **no
business handlers** and never marks unknown events as delivered. Unknown events
are retried with a delay and eventually parked for explicit investigation.
Add idempotent handlers and their integration tests together with each domain
event. Delivery is at least once; external providers must accept stable event
IDs or use a delivery ledger.

## Rendering references

Astro uses `output: 'server'` with the Node standalone adapter; individual routes
may opt into prerendering. This is the current SSR/static mixing mechanism, not
the removed `hybrid` output option.

- https://docs.astro.build/en/guides/on-demand-rendering/
- https://docs.astro.build/en/guides/integrations-guide/node/
- https://github.com/drogonframework/drogon/tree/v1.9.11
