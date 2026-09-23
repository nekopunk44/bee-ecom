# Observability extension point

Foundation emits structured application logs, propagates server-generated
request IDs and supplies liveness/readiness probes. No Prometheus endpoint or
Grafana dashboard is claimed to exist yet.

Before staging, instrument a bounded route-label HTTP histogram and counters
for status classes, DB/Redis latency, dependency errors and cache hits. Commerce
adds order creation, checkout failures, reservation conflicts and worker backlog
age. Never use request IDs, product IDs or customer IDs as metric labels.

Prometheus scrapes private endpoints; Grafana and the log store require access
control. Alert on readiness failures, sustained 5xx, latency SLO breaches,
dead-letter events, oldest outbox age and failed backups. Validate alerts by
injecting dependency failure in staging.
