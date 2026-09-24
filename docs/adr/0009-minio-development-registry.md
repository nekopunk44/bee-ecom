# MinIO development images and maintenance boundary

Status: accepted for foundation, 2026-09-22.

## Context

The requested development S3 service is MinIO. Docker Hub no longer serves the
selected images, and GitHub Actions received `unauthorized` from the Quay images.
The upstream community repositories are archived, so local compatibility does
not establish a supported production storage solution.

## Decision

Build isolated local server and initializer images from Alpine, downloading the
official MinIO server and `mc` GitHub release binaries pinned to their SHA-256
digests. This keeps MinIO while avoiding unauthenticated image registries. Use a
maintained managed S3-compatible provider for production, as required by the
original brief. Confirm maintenance/support terms before selecting it.

## Alternatives

Building archived MinIO sources adds maintenance without restoring upstream
support. Switching the local emulator now would depart from the requested stack
without a current compatibility benefit.

## Consequences

The MinIO service remains local-only. An image availability check exists at
`node infra/scripts/verify-images.mjs`; it verifies registry manifests, not image
startup or security. Both MinIO images verify their release binary digest.
Source references:

- https://github.com/minio/minio/blob/master/docs/orchestration/docker-compose/docker-compose.yaml
- https://github.com/minio/mc/releases
