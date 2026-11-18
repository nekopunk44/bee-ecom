# Demo deployment: Vercel and Render

A public demo stand on free plans. It is not the production rollout described in
[operations](operations.md): no backups, development settings and one database role.

```text
https://bee-ecom.vercel.app        storefront, Astro on Vercel functions (fra1)
https://bee-ecom-admin.vercel.app  admin, static Vite build
        |  both projects rewrite /api/* (apps/*/vercel.json)
        v
https://bee-ecom-api.onrender.com  C++ API, free Render web service (Frankfurt)
        |-- bee-db  free Render Postgres
        `-- bee-kv  free Render Key Value
```

Vercel proxies `/api/*`, so the browser stays on its own origin: the session cookie,
`Origin` checks and the CSP `connect-src 'self'` work as behind the local Nginx. The
security headers from `infra/nginx/security.conf` are repeated in both `vercel.json`
files. The storefront switches from `@astrojs/node` to `@astrojs/vercel` only when
Vercel's build sets `VERCEL=1`; Docker, CI and local runs are unchanged.

## How a release reaches Render

On every push to `main` the CI `containers` job, after the stack checks pass, builds
`infra/docker/backend.Dockerfile` with target `render` and pushes
`ghcr.io/nekopunk44/bee-ecom-api` as `latest` and as the commit SHA. That image adds
Node.js and `infra/render/start.sh`: the free plan has no pre-deploy step, so the
container applies migrations, creates the first administrator from
`BEE_ADMIN_EMAIL`/`BEE_ADMIN_PASSWORD` if they are set, and then starts the API.

Image-backed Render services do not redeploy on a new tag. If the repository secret
`RENDER_DEPLOY_HOOK` is set, CI calls it after the push; otherwise deploy the latest
image from the Render dashboard (**Manual Deploy → Deploy latest reference**).

## First setup

1. After the first green CI run on `main`, open the `bee-ecom-api` package on GitHub
   (profile → Packages) and make sure its visibility is **Public**: Render pulls it
   without registry credentials.
2. Render: **New → Blueprint**, repository `nekopunk44/bee-ecom`. Enter
   `BEE_ADMIN_EMAIL`, `BEE_ADMIN_PASSWORD` (12–256 characters) and the `S3_*`
   values from [media storage](#media-storage-backblaze-b2), then apply.
   `https://bee-ecom-api.onrender.com/api/v1/health/ready` answers `ready` when the
   database and Key Value are reachable.
3. Optional: copy the deploy hook of `bee-ecom-api` (Settings → Deploy Hook) into the
   GitHub secret `RENDER_DEPLOY_HOOK`.
4. Vercel: **Add New → Project**, import `nekopunk44/bee-ecom`, name `bee-ecom`, Root
   Directory `apps/storefront`, environment variable
   `API_INTERNAL_URL=https://bee-ecom-api.onrender.com`. The canonical site URL comes
   from Vercel's `VERCEL_PROJECT_PRODUCTION_URL`.
5. The same import again: name `bee-ecom-admin`, Root Directory `apps/admin`, no
   variables.
6. Sign in to the admin, then delete `BEE_ADMIN_PASSWORD` in Render. The account stays.

If Vercel or Render assigns other domains, update the rewrite destinations in
`apps/*/vercel.json` and `STOREFRONT_ORIGIN`/`ADMIN_ORIGIN` in Render.

## Media storage (Backblaze B2)

The bucket stays private: browsers receive images from `/api/v1/media/...`, and only
the API reads and writes objects, with path-style S3 requests signed by curl.

1. Create a Backblaze account with the **EU Central** region; the region is chosen at
   sign-up and cannot be changed later.
2. **Buckets → Create a Bucket**: a globally unique lowercase name (letters, digits,
   hyphens), **Private**. The bucket page shows the S3 endpoint, for example
   `s3.eu-central-003.backblazeb2.com`.
3. **Application Keys → Add a New Application Key**: access to this bucket only,
   **Read and Write**. The application key is shown once.
4. In Render, `bee-ecom-api` → Environment:

   | Variable        | Value                                        |
   | --------------- | -------------------------------------------- |
   | `S3_ENDPOINT`   | `https://` + the endpoint, no trailing `/`   |
   | `S3_REGION`     | the region part of it, e.g. `eu-central-003` |
   | `S3_BUCKET`     | the bucket name                              |
   | `S3_ACCESS_KEY` | keyID                                        |
   | `S3_SECRET_KEY` | applicationKey                               |

The S3 variables are `sync: false` in `render.yaml`, so Blueprint syncs keep the
dashboard values. A new Blueprint asks for them; without storage, placeholders let
the API start and uploads answer 503.

## Limitations

- `APP_ENV=development`: `staging` requires `verify-full` TLS to PostgreSQL, while the
  connection over Render's private network is plain. As a result the session cookie
  has no `Secure` flag; `vercel.app` serves HTTPS only.
- Migrations run with the same database role as the API; Render's free database has
  one role.
- No worker: free Render plans have no background workers, so expired cart
  reservations are not released and outbox events wait.
- The free API sleeps after 15 minutes without traffic and wakes in about a minute.
  The storefront waits 3–5 seconds for the API, so the first page after a pause may
  show that the catalog is unavailable.
- The free database expires 30 days after creation. Key Value keeps nothing on disk;
  the API uses it only for readiness.
- The login limit per address relies on `X-Real-IP`, which the local Nginx overwrites.
  Here the proxy chain decides it; the limit per email works as before.
- The database starts empty: create categories and products in the admin.
- Vercel's free Hobby plan allows non-commercial use only.
