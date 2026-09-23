# Validation history

## Catalog — 2026-09-23

Local checks passed: OpenAPI generation/lint, TypeScript/Svelte/Astro checks,
production builds, 9 SQL/migration tests and 10 Chromium browser tests.
SQL tests execute the actual migrations and repository queries using PGlite;
they do not establish concurrent PostgreSQL behavior. Browser tests use an API
fixture and cover SSR/search, failures, editor saves, revision conflicts and RBAC UI.
The admin build is approximately 68.4 kB JS / 25.5 kB gzip.

C++ compilation, CTest and real container/API integration are pending remote CI.
The user declined installing Linux/Docker locally. See [catalog.md](catalog.md)
for implemented scope and remaining limitations. The following records describe
the earlier foundation snapshot, not the current catalog feature set.

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

Docker Engine/Desktop, a configured Linux environment and the C++ build toolchain
are absent. A standalone Compose executable validates configuration but cannot
start containers. Therefore the following are **pending**, not passed:

- C++23 compilation, linking and CTest configuration tests;
- complete Compose startup and container runtime health checks;
- real PostgreSQL migration execution and Redis connectivity;
- MinIO startup, bucket initialization and Nginx routing/security at runtime;
- outbox defer/dead-letter behavior against PostgreSQL;
- dependency outage and recovery checks, live API/admin integration;
- container vulnerability scanning and production performance profiling.

The GitHub Actions workflow includes the build, runtime, migration, outbox and
outage checks. It has been authored but not executed remotely in this workspace.
Run the documented Compose commands on a Docker host before accepting Milestone
1 as fully verified. No production deployment has been performed.

## Remaining scope

No catalog/customer/auth/payment/inventory business endpoints are exposed.
No production RBAC, TOTP, rate limiting, media upload adapter, recommendation
engine, Prometheus endpoint or deployment pipeline is claimed. ADRs and the
milestone plan specify where these arrive. MinIO is an isolated development
dependency; production storage must be a maintained managed S3 service.
