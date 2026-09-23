# MinIO development images and maintenance boundary

Status: accepted for foundation, 2026-09-22.

## Context

The requested development S3 service is MinIO. Docker Hub requests for the
selected MinIO images returned 401 during implementation, while the same
versioned images were available in the official Quay registry. The upstream
community repositories are archived, so local compatibility does not establish
a supported production storage solution.

## Decision

Use `quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z` and
`quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z` for isolated local development.
Use a maintained managed S3-compatible provider for production, as required by
the original brief. Confirm maintenance/support terms before selecting it.

## Alternatives

Building archived MinIO sources adds maintenance without restoring upstream
support. Switching the local emulator now would depart from the requested stack
without a current compatibility benefit.

## Consequences

The MinIO service remains local-only. An image availability check exists at
`node infra/scripts/verify-images.mjs`; it verifies registry manifests, not image
startup or security. Source references:

- https://github.com/minio/minio/blob/master/docs/orchestration/docker-compose/docker-compose.yaml
- https://github.com/minio/mc/releases
