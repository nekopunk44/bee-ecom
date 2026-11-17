#!/bin/sh
# Entry point of the Render demo image: migrations first, then the optional first
# administrator, then the API replaces this shell and receives Render's signals.
set -eu
cd /app

# host[:port] after the last "@" and before the path, e.g.
# postgresql://bee:secret@dpg-abc-a/bee -> dpg-abc-a, redis://red-abc:6379 -> red-abc:6379
address() {
  rest=${1#*://}
  rest=${rest##*@}
  printf '%s' "${rest%%/*}"
}
if [ -n "${DATABASE_URL:-}" ]; then
  db=$(address "$DATABASE_URL")
  export PGHOST="${db%%:*}"
  case "$db" in *:*) export PGPORT="${db##*:}" ;; esac
fi
if [ -n "${REDIS_URL:-}" ]; then
  kv=$(address "$REDIS_URL")
  export REDIS_HOST="${kv%%:*}"
  case "$kv" in *:*) export REDIS_PORT="${kv##*:}" ;; esac
fi

node infra/scripts/migrate.mjs
if [ -n "${BEE_ADMIN_EMAIL:-}" ] && [ -n "${BEE_ADMIN_PASSWORD:-}" ]; then
  # The password reaches bee-admin-create on stdin, never as an argument. On later
  # starts the administrator already exists and creation fails harmlessly.
  node -e 'process.stdout.write(JSON.stringify({ email: process.env.BEE_ADMIN_EMAIL, password: process.env.BEE_ADMIN_PASSWORD }) + "\n")' |
    bee-admin-create || echo '{"service":"bee-render","event":"admin_not_created"}'
fi
exec bee-api
