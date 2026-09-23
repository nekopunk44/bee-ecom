# Local environment and production boundary

Status: accepted for foundation, 2026-09-22.

## Context

An executable development stack must not imply completed security and launch readiness.

## Decision

Bind local ports to loopback, generate random local credentials, isolate data services and use non-root app processes. Gate staging/production database config on certificate verification.

## Alternatives

Shared default passwords or public database ports are unsafe; pretending a Compose file is a full production deployment obscures missing controls.

## Consequences

This Compose file is development-only. Production needs TLS, managed secrets, least-privilege DB/storage roles, private Redis networking/TLS tunnel, backup recovery tests and approval-based CD. No public admin mutation routes exist in foundation.
