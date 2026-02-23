#!/usr/bin/env bash
# =============================================================================
# Bloov Accounting — Production-Safe Database Export Script
# =============================================================================
# Exports full schema + data for all public tables.
# Excludes Supabase auth system tables (auth.*, storage.*, _realtime.*,
# supabase_migrations.*, pgsodium.*, vault.*).
#
# Usage:
#   export PGPASSWORD="<your-db-password>"
#   bash scripts/export-database.sh
#
# Output:
#   bloov_export_YYYYMMDD_HHMMSS.sql
#
# Requirements:
#   pg_dump >= 14 (matches Supabase Postgres version)
# =============================================================================

set -euo pipefail

DB_HOST="${PGHOST:-db.your-project-ref.supabase.co}"
DB_PORT="${PGPORT:-5432}"
DB_NAME="${PGDATABASE:-postgres}"
DB_USER="${PGUSER:-postgres}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUTPUT_FILE="bloov_export_${TIMESTAMP}.sql"

echo "============================================="
echo "  Bloov Accounting — Database Export"
echo "  Target : ${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo "  Output : ${OUTPUT_FILE}"
echo "============================================="

pg_dump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --dbname="${DB_NAME}" \
  --schema=public \
  --no-owner \
  --no-privileges \
  --no-comments \
  --format=plain \
  --encoding=UTF8 \
  --exclude-table-data='public.audit_logs' \
  --file="${OUTPUT_FILE}"

echo ""
echo "Export complete: ${OUTPUT_FILE}"
echo "Size           : $(du -sh "${OUTPUT_FILE}" | cut -f1)"
echo ""
echo "To restore on a fresh database:"
echo "  psql -h <host> -U postgres -d postgres -f ${OUTPUT_FILE}"
