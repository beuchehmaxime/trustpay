#!/bin/sh
set -e

# Apply committed migrations.
#
# This used to be `prisma db push --accept-data-loss`, which made every single
# deploy capable of destroying customer data: `db push` reshapes the database to
# match the schema file by whatever means necessary, and `--accept-data-loss`
# told it not to ask before dropping a column or a table. A renamed field would
# have silently taken the data with it, with no migration history to review
# beforehand and nothing to roll back to.
#
# `migrate deploy` only ever runs SQL that a human wrote, reviewed and
# committed. It applies pending migrations in order, records each one, and
# stops rather than improvising if the database is not in the state the history
# says it should be.
#
# IMPORTANT (PgBouncer): migrations run DDL + advisory locks, which do NOT work
# through PgBouncer's transaction pooling. So this uses a DIRECT connection when
# DIRECT_DATABASE_URL is provided (production: a session-mode PgBouncer database
# or Postgres itself), and falls back to DATABASE_URL otherwise (local dev,
# where DATABASE_URL is already direct). The application itself always runs on
# DATABASE_URL (the pooled connection).
echo "[entrypoint] Applying database migrations (prisma migrate deploy)..."
DATABASE_URL="${DIRECT_DATABASE_URL:-$DATABASE_URL}" npx prisma migrate deploy

echo "[entrypoint] Starting backend: $*"
exec "$@"
