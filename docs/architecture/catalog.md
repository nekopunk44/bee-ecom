# Catalog increment — 2026-09-23

## Implemented

Public API and Astro pages list, search and filter active products by category,
brand and price; sorting and pagination happen in PostgreSQL. Product pages use
RU/RO translations, stable slugs, variants, attributes, responsive images and
Product/Offer structured data. Neither catalog nor product pages need browser JS.
Indexing is opt-in (`ENABLE_INDEXING=true`); the dynamic sitemap splits products
into small page files. Drafts and archived products are excluded from public APIs.

Admin can sign in, list products, create and edit both translations, set variants,
prices/attributes, upload images and archive products. Archival requires UI
confirmation. Revision conflicts preserve the editor's current fields. Reference
screens list/create categories, brands and attribute definitions. Editing/deleting
reference definitions and nested-category management remain a subsequent increment.

Opaque sessions expire after 30 minutes; only token digests are stored. Login is
limited by hashed email and client address. Mutations require the configured
admin Origin and a current database permission. Public registration, password
reset, refresh rotation and 2FA remain in the commerce/security milestones.

All product writes run through a transaction-scoped database function, which
checks revisions and preserves existing variant identity. It records an audit
event together with the change. Removing a variant deactivates it rather than
deleting its identity. There is no stock column and no invented stock availability.

## Administrative setup

```powershell
npm run setup
docker compose up --build -d --wait --wait-timeout 180
./infra/scripts/create-admin.ps1 -Email owner@example.md
```

The provisioning script prompts for a password without echoing it and passes
JSON on stdin to the CLI. On Linux, pass the equivalent `{email,password}` JSON
through stdin to `docker compose exec -T api bee-admin-create`; never put real
passwords into shell history or tracked files. Existing email addresses are
rejected. Sign in at `http://admin.localhost:8080`.

Create categories first, then optional brands/attributes, then a product with
both translations and at least one active variant. Publish it to make it visible
at `/ru/catalog/` and `/ro/catalog/`. Online ordering is intentionally unavailable
until the commerce milestone. No sample products or default admin passwords are
installed automatically.

For direct Vite development, set `ADMIN_ORIGIN=http://127.0.0.1:5173` in the API
environment and restart API. Only one exact admin origin is accepted at a time.
`API_INTERNAL_URL` is the storefront's server-only API origin. Browser requests
remain same-origin. The API must not be exposed directly to the internet: it
trusts the X-Real-IP value overwritten by the configured Nginx ingress.

## Media lifecycle

Uploads accept only JPEG, PNG and WebP magic bytes, <=8 MiB and <=40 million
pixels. libvips produces metadata-stripped WebP variants in 320/640/1280 bounds
without upscaling. Originals are not retained. S3 keys contain a generated UUID,
never user-controlled filenames. curl signs storage requests using AWS SigV4.
Local MinIO receives a separate restricted application identity with GetObject
and PutObject access to the bucket's products prefix; API never receives root
MinIO credentials. Product images remain private until their product is published.

The current implementation processes a bounded upload on a background executor
while the admin request waits, not on an HTTP event loop. Async processing jobs,
orphan cleanup and an image-delivery cache are follow-ups before high-volume
production. A failure after an S3 write may leave an unreferenced UUID prefix;
these are not listed or exposed as catalog images. Do not deploy without a
reviewed cleanup/lifecycle policy and container vulnerability scan.

## Verification boundary

PGlite executes the actual PostgreSQL migrations/functions and repository SQL
locally. Tests cover translations, money, search/pagination, revision conflicts,
constraint rollback and archival visibility. It has one embedded database
connection and does **not** prove multi-connection concurrency behavior.

Browser E2E uses an explicit test-only upstream fixture for SSR and request mocks
for admin UI. These are excluded from production images. C++ build, crypto,
real S3 and full network integration are verified by the container CI job when
available; they are not implied by browser/PGlite test success.
