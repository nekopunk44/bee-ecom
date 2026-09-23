# Delivery milestones

1. **Foundation (implemented; container verification pending):** independent applications, validated configuration,
   Compose infrastructure, health/readiness, PostgreSQL/Redis connectivity,
   correlated JSON logs, initial OpenAPI/client generation, migration runner,
   outbox worker skeleton, CI, operational docs and smoke checks.
   Acceptance: frontend checks/builds pass; on a Docker host all services become
   healthy, readiness exercises dependencies, routes resolve by hostname, and
   dependency outage/recovery behaves as documented.
2. **Catalog (current):** translated categories/brands/products/variants/attributes,
   S3 media processing, public catalog and product pages, search/filtering,
   server-authorized admin CRUD and SEO. Deliver end-to-end, not isolated APIs.
   See [implemented catalog and remaining scope](catalog.md).
3. **Commerce:** auth/RBAC, cart, checkout, payment/delivery adapters, inventory
   ledger and reservations, orders and admin processing. Test concurrent buyers
   against real PostgreSQL, idempotent retries and reservation expiry.
4. **Distinctive features:** compatibility, budget-aware apiary configurator,
   explainable recommendations, favorites, comparison and warehouse views.
5. **Hardening:** rate limits, 2FA, audit coverage, Prometheus/Grafana, real-user
   performance budgets, E2E commerce tests, recovery drill, staging/CD workflow
   and deployment approval. No production launch before this acceptance gate.

Do not present an unimplemented milestone as working UI. Each step extends the
contract, database migration, backend use case, usable UI and relevant tests.
