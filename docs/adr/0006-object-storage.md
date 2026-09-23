# S3-compatible media

Status: accepted for foundation, 2026-09-22.

## Context

Product media needs independent durability and delivery.

## Decision

Use a private, versioned MinIO bucket in development and managed S3-compatible storage in production.

## Alternatives

Database blobs and container-local uploads couple media to application/database scaling.

## Consequences

Foundation provisions storage only; upload validation, least-privilege application credentials, image variants and storage adapter arrive in the catalog milestone. Root MinIO credentials are never application upload credentials.
