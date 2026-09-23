# Catalog increment and initial administrative access

Status: accepted, 2026-09-23.

## Context

Catalog CRUD requires authorization before the wider customer-auth milestone.
Products need RU/RO translations, variants, attributes, media and server-rendered
public pages. Existing foundation code remains in place.

## Decision

Implement catalog as an application service and PostgreSQL repository. Use
integer MDL minor units, optimistic revisions, soft archive and transactional
audit records. Public queries expose only active products and active variants.
Administrative writes validate RBAC in the API and require both translations.

Start admin access with Argon2id passwords and opaque 30-minute database-backed
sessions in HttpOnly, SameSite=Strict cookies, Secure outside local development.
No refresh token is issued in this increment; expiry requires another login.
Customer registration, verification/reset and rotating refresh-token families
remain in the commerce milestone. Require exact configured Origin on mutations.
Provision the first administrator through a local CLI, never a public endpoint.

Use a bounded background executor for blocking repository/password/media work;
never block Drogon HTTP event loops. Queue state is transient execution state,
not customer/business storage. Database transactions remain authoritative.

Media is decoded and resized on the backend, then uploaded to S3-compatible
storage. Keep the bucket private; serve generated variants through a controlled
same-origin media endpoint. Original user filenames never become object keys.

## Alternatives

An open admin endpoint, frontend-only permissions or a shared development API
key would create an unsafe path into the catalog. Full customer identity flows
would unnecessarily couple the catalog increment to all commerce features.

## Consequences

All admin requests have a server-side identity and permission check. Updates use
a revision to prevent lost edits. Local catalog fixtures are explicitly opt-in.
Media processing and storage introduce libvips and libcurl for concrete use cases.
Admin session renewal UX is deliberately bounded until customer auth is added.
