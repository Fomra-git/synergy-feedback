#!/usr/bin/env bash
# Runs all migrations + seed + RLS tests against a throwaway local PostgreSQL
# database using a stub of the Supabase auth/storage schemas.
#
# Requirements: psql and a running PostgreSQL server you can connect to as a
# superuser. Configure with standard libpq env vars (PGHOST, PGPORT, PGUSER,
# PGPASSWORD). Default database name: synergy_feedback_test (dropped/recreated).
set -euo pipefail

DB="${TEST_DB_NAME:-synergy_feedback_test}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists ${DB};" -c "create database ${DB};"

run() { psql -v ON_ERROR_STOP=1 -q -d "${DB}" -f "$1"; }

run "${ROOT}/supabase/tests/supabase-stub.sql"
for f in "${ROOT}"/supabase/migrations/*.sql; do
  echo "→ applying $(basename "$f")"
  run "$f"
done
echo "→ applying seed.sql"
run "${ROOT}/supabase/seed.sql"

echo "→ running seed-free RLS tests on a fresh database"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists ${DB};" -c "create database ${DB};"
run "${ROOT}/supabase/tests/supabase-stub.sql"
for f in "${ROOT}"/supabase/migrations/*.sql; do run "$f"; done
psql -v ON_ERROR_STOP=1 -d "${DB}" -f "${ROOT}/supabase/tests/rls.test.sql"

psql -q -d postgres -c "drop database if exists ${DB};"
