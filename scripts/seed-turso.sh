#!/usr/bin/env bash
# Seed a Turso database from the repo's schema, seed data, and migrations.
# Usage: ./scripts/seed-turso.sh <database-name>
set -euo pipefail

DB_NAME="${1:-menusnap}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Seeding Turso database: $DB_NAME"
turso db shell "$DB_NAME" < "$ROOT/schema.sql"
turso db shell "$DB_NAME" < "$ROOT/seed.sql"
turso db shell "$DB_NAME" < "$ROOT/backend/src/db/migrations.sql"
echo "Done. Get credentials with:"
echo "  turso db show $DB_NAME --url"
echo "  turso db tokens create $DB_NAME"
