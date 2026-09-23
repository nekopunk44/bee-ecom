# Operations and production rollout

## Environments

`.env` is local and ignored. `npm run setup` generates random local credentials
without overwriting an existing file. Compose uses service DNS names. Public
origin (`SITE_URL`) is a storefront build argument; rebuild when it changes.
The browser talks only to its own origin, including admin `/api/v1`; CORS is not
enabled. UI dev servers bind loopback. `APP_ENV` accepts development, test,
staging and production. Missing credentials or invalid numeric settings fail
startup. Staging/production API/worker require PostgreSQL `verify-full` and a
mounted `PGSSLROOTCERT`. Node migration jobs also need a verified CA via their
PostgreSQL client environment. Never run migrations with the public runtime role.

The supplied Compose configuration is local development, not a production
override. PostgreSQL, Redis and the S3 API are private to the Docker network.
MinIO console is loopback port 9001. Both web hostnames route through loopback
port 8080. Docker administrators can inspect environment credentials; production
must inject secrets through the deployment secret store with restricted access.

## Health, logging and failure recovery

- `GET /api/v1/health/live`: process only, always independent of the database.
- `GET /api/v1/health/ready`: checks migration 0001 and a Redis PING (2s timeout
  per dependency), returns 503 with a sanitized error on failure.
- `GET /health/live`: storefront/admin process health on their respective hosts.
- Worker health is a heartbeat refreshed only after a successful database poll.

API access logs are JSON with timestamp, level, service, generated requestId,
route label, method, status and duration. Unknown paths are logged as `unmatched`;
query strings, bodies and headers are excluded. Worker and migrator emit
sanitized event names. Framework verbose logging is disabled to avoid logging
SQL/credentials. Do not enable it in production without a redaction review.
Application-level database latency and business metrics are a later increment.

Use `docker compose logs -f api worker nginx` for local logs. Stop Redis and
check `/health/ready` (503) and `/health/live` (200), then start Redis again.
PostgreSQL outages behave the same way. PostgreSQL clients reconnect. Redis DNS
is resolved at API startup: if Redis is **recreated with a new IP**, restart API
as well (`docker compose restart api`). Nginx re-resolves upstream service DNS.

Inspect pending events with a restricted DB account:

```sql
SELECT event_type, count(*), min(created_at)
FROM outbox_events
WHERE processed_at IS NULL AND dead_lettered_at IS NULL
GROUP BY event_type;
```

Unknown events retry every minute and are parked on the fifth attempt. No
business handlers ship in Milestone 1. Requeue only after the matching handler
is deployed and its idempotency checked; preserve the original event ID.

## Backup and restore policy (required before launch)

Proposed objectives: PostgreSQL RPO <= 15 minutes and RTO <= 4 hours, subject to
an actual recovery drill. Enable managed point-in-time recovery/WAL archival.
Take encrypted daily backups, retain daily copies for 30 days and monthly copies
for 12 months according to the eventual retention policy. Store copies in a
separate account/location from production. Alert on backup failure and WAL lag.
Use storage versioning, lifecycle rules and cross-account copies for media.

Restore into an isolated environment: provision an empty database, restore a
backup and replay WAL to the desired point, verify migration checksums, check
order/payment/inventory invariants, restore media versions, run smoke/E2E tests,
then switch traffic with a documented rollback window. Test the process at least
quarterly. A Docker volume is not a backup. `docker compose down` preserves
volumes; deleting volumes loses local data.

## Deployment preparation

1. Build immutable images in CI, scan them, record SBOMs and pin base images by
   digest in the release pipeline. Current local version tags are not immutable.
2. Provision managed PostgreSQL, private Redis and S3 with distinct roles,
   credentials, quotas, encryption and tested backups.
3. Configure real storefront/admin domains, CDN/WAF, origin firewall and TLS.
   Set HSTS only after HTTPS is in place. Trust forwarding headers only from
   explicitly allowlisted proxies; the local Nginx configuration overwrites them.
4. Apply expand/contract migrations before shifting traffic. Start the new API,
   worker, storefront and admin; wait for readiness and execute smoke tests.
5. Stage releases before an approved production rollout. Drain old connections
   and keep the previous image release for application rollback. Worker retries
   must remain safe across rolling deployments.
6. Before commerce launch implement auth/RBAC, CSRF, rate limiting, media
   validation, payment security and the Milestone 5 acceptance checklist.

CI currently validates changes; it does not publish images, create cloud
resources or deploy automatically. Registry, environment and deployment secrets
must be configured for the later CD milestone.
