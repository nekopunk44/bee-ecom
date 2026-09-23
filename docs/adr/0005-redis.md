# Disposable Redis

Status: accepted for foundation, 2026-09-22.

## Context

Caching and rate limiting should not change business correctness.

## Decision

Use authenticated Redis 7 for temporary workloads only. Foundation checks connectivity but stores no business data there.

## Alternatives

In-process state prevents horizontal scaling; using Redis for inventory would create two competing sources of truth.

## Consequences

Redis loss degrades readiness, not business durability. The local instance intentionally has no persistent volume. Never use the allkeys-lru cache for durable security sessions without a separate policy/instance.
