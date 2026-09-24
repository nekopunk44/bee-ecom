# Validation history

## Catalog — 2026-09-23

Local checks passed: OpenAPI generation/lint, TypeScript/Svelte/Astro checks,
production builds, 9 SQL/migration tests and 10 Chromium browser tests.
SQL tests execute the actual migrations and repository queries using PGlite;
they do not establish concurrent PostgreSQL behavior. Browser tests use an API
fixture and cover SSR/search, failures, editor saves, revision conflicts and RBAC UI.
The admin build is approximately 68.4 kB JS / 25.5 kB gzip.

See [catalog.md](catalog.md) for implemented scope and remaining limitations.
The user declined installing Linux/Docker locally, so container checks run in CI.

## GitHub Actions runtime snapshot — 2026-09-24, commit `ca4ee52`

Frontend CI passed, including format, generated contract, type checks, 9 unit/
SQL tests, audit, production builds and all 10 browser tests. The container job
built C++23 and passed both CTests. Compose startup, service readiness, health,
request correlation, locale routing and admin-host smoke checks passed. The
catalog integration scenario reached image upload, category creation and draft
creation, then exposed a test-harness omission: the update request did not send
the persisted variant ID. A follow-up fixes the harness; a new workflow run must
pass before catalog integration is verified. Migration
idempotency, outbox delivery and dependency outage checks did not run after the
integration step failed.

The following section records the earlier foundation snapshot, not the catalog.

## Foundation snapshot — 2026-09-22

## Executed on the supplied Windows machine

| Check                                         | Result                                              |
| --------------------------------------------- | --------------------------------------------------- |
| npm dependency installation / lockfile        | Passed                                              |
| OpenAPI lint and TypeScript client generation | Passed                                              |
| Astro, Svelte and API-client type checks      | Passed, no errors/warnings                          |
| Storefront and admin production builds        | Passed                                              |
| Migration planner unit tests                  | 3 passed                                            |
| Chromium frontend E2E                         | 6 passed                                            |
| npm audit                                     | 0 reported vulnerabilities at execution time        |
| Docker image manifest availability            | All 8 unique external image tags returned 200       |
| Docker Compose 2.39.4 config validation       | Passed using standalone executable                  |
| Desktop/mobile visual inspection              | Captured and inspected 1280px and 360px screenshots |

E2E covers SSR with JavaScript disabled, Russian/Romanian navigation, no client
scripts on the foundation storefront, mobile horizontal overflow, keyboard
skip link, HTTP 404 and admin success/503/network-error states. Admin requests
in these tests are mocked. This is not an integration test of Drogon.

Measured admin production artifact: approximately 38.3 kB JS / 15.1 kB gzip.
The current storefront sends no client JavaScript. These figures are foundation
bundle observations, not Core Web Vitals measurements for a finished catalog.

## Not executable in this environment

Docker Engine/Desktop and the Linux C++ toolchain are absent on the supplied
Windows machine. A standalone Compose executable validates configuration but
cannot start containers. The following checks still need a passing remote run:

- end-to-end catalog login, publication, media retrieval/privacy and RBAC;
- migration idempotency and outbox defer/dead-letter behavior;
- dependency outage and recovery checks against the running API;
- container vulnerability scanning and production performance profiling.

No production deployment has been performed.

## Remaining scope

Customer, payment and inventory business endpoints are not implemented. Admin
RBAC and login throttling exist; TOTP, customer authentication, broader rate
limits, recommendations, Prometheus and a deployment pipeline remain future work. ADRs and the
milestone plan specify where these arrive. MinIO is an isolated development
dependency; production storage must be a maintained managed S3 service.
