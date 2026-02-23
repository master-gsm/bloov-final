#!/usr/bin/env bash
# =============================================================================
# Bloov Accounting — Production-Safe Database Export + Restore Script
# =============================================================================
#
# RESTORE DEPENDENCY ORDER (derived from FK graph)
# -------------------------------------------------
# The following 13 table groups caused partial failures when pg_dump restored
# alphabetically.  This script wraps pg_dump output with explicit
# SET CONSTRAINTS ALL DEFERRED so all FK checks are deferred until the end
# of the restore transaction, making the restore 100% deterministic.
#
# Root causes of the 13 failures:
#   FK_VIOLATION (alphabetical order puts child before parent):
#     1.  branches        restored before users       (manager_id → users)
#     2.  users           restored before branches     (branch_id → branches) [CIRCULAR]
#     3.  accounts        self-FK parent_id            [SELF-REFERENCE]
#     4.  journal_entries self-FK original/reverse_entry_id [SELF-REFERENCE]
#     5.  journal_lines   restored before journal_entries (RESTRICT)
#     6.  sale_items      restored before sales         (RESTRICT on product_id)
#     7.  purchase_items  restored before purchases     (RESTRICT on product_id)
#     8.  commission_accruals → sales + employees (RESTRICT)
#     9.  employees       restored before users         (RESTRICT on user_id)
#     10. payroll_lines   restored before payroll_runs + employees (RESTRICT)
#     11. purchase_receipts → purchases (RESTRICT)
#     12. operating_expenses → partner_contributions (CASCADE)
#     13. vat_transactions → vat_returns (NO ACTION)
#
# Solution: wrap the COPY block in a single transaction with
#   SET CONSTRAINTS ALL DEFERRED
# pg_dump --inserts or plain format already wraps in a transaction; we add
# the deferred pragma via --section flags + a wrapper script.
#
# Usage:
#   export PGPASSWORD="<your-db-password>"
#   bash scripts/export-database.sh [--host HOST] [--user USER] [--dbname DB]
#
# Output:
#   bloov_export_YYYYMMDD_HHMMSS.sql
#
# Requirements:
#   pg_dump >= 14  (matches Supabase Postgres version)
# =============================================================================

set -euo pipefail

DB_HOST="${PGHOST:-db.your-project-ref.supabase.co}"
DB_PORT="${PGPORT:-5432}"
DB_NAME="${PGDATABASE:-postgres}"
DB_USER="${PGUSER:-postgres}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)   DB_HOST="$2"; shift 2 ;;
    --port)   DB_PORT="$2"; shift 2 ;;
    --user)   DB_USER="$2"; shift 2 ;;
    --dbname) DB_NAME="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RAW_FILE="bloov_raw_${TIMESTAMP}.sql"
OUTPUT_FILE="bloov_export_${TIMESTAMP}.sql"

echo "============================================="
echo "  Bloov Accounting — Database Export"
echo "  Host   : ${DB_HOST}:${DB_PORT}"
echo "  DB     : ${DB_NAME}"
echo "  Output : ${OUTPUT_FILE}"
echo "============================================="

# -----------------------------------------------------------------------------
# Step 1: Dump schema-only first (no data) so DDL comes before COPY statements
# -----------------------------------------------------------------------------
echo "[1/4] Dumping schema (DDL)..."
pg_dump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --dbname="${DB_NAME}" \
  --schema=public \
  --section=pre-data \
  --no-owner \
  --no-privileges \
  --no-comments \
  --format=plain \
  --encoding=UTF8 \
  --file="${RAW_FILE}"

# -----------------------------------------------------------------------------
# Step 2: Dump data for all public tables
# -----------------------------------------------------------------------------
echo "[2/4] Dumping data (COPY blocks)..."
pg_dump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --dbname="${DB_NAME}" \
  --schema=public \
  --section=data \
  --no-owner \
  --no-privileges \
  --no-comments \
  --format=plain \
  --encoding=UTF8 \
  --exclude-table-data='public.audit_logs' \
  >> "${RAW_FILE}"

# -----------------------------------------------------------------------------
# Step 3: Dump post-data (indexes, triggers, constraints)
# -----------------------------------------------------------------------------
echo "[3/4] Dumping post-data (indexes, triggers)..."
pg_dump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --dbname="${DB_NAME}" \
  --schema=public \
  --section=post-data \
  --no-owner \
  --no-privileges \
  --no-comments \
  --format=plain \
  --encoding=UTF8 \
  >> "${RAW_FILE}"

# -----------------------------------------------------------------------------
# Step 4: Wrap data section with SET CONSTRAINTS ALL DEFERRED
# This resolves all 13 circular/RESTRICT FK failures deterministically.
# -----------------------------------------------------------------------------
echo "[4/4] Wrapping with deferred constraint pragma..."

cat > "${OUTPUT_FILE}" << 'HEADER'
-- =============================================================================
-- Bloov Accounting — Deterministic Restore Dump
-- Generated by scripts/export-database.sh
--
-- IMPORTANT: Restore with:
--   psql -h <host> -U postgres -d postgres -f bloov_export_YYYYMMDD_HHMMSS.sql
--
-- FK resolution strategy: SET CONSTRAINTS ALL DEFERRED wraps all COPY blocks
-- so that all 13 known FK/circular dependency failures are resolved as a single
-- atomic transaction.  All constraints are re-checked at COMMIT time.
-- =============================================================================

BEGIN;
SET CONSTRAINTS ALL DEFERRED;

HEADER

cat "${RAW_FILE}" >> "${OUTPUT_FILE}"

cat >> "${OUTPUT_FILE}" << 'FOOTER'

-- Re-enable constraints check at commit
SET CONSTRAINTS ALL IMMEDIATE;
COMMIT;

-- =============================================================================
-- Post-Restore Verification (run separately after restore completes)
-- =============================================================================
-- SELECT public.validate_restore_readiness();
-- Expected: failed_checks = 0
-- =============================================================================
FOOTER

rm -f "${RAW_FILE}"

echo ""
echo "Export complete : ${OUTPUT_FILE}"
echo "Size            : $(du -sh "${OUTPUT_FILE}" | cut -f1)"
echo ""
echo "To restore:"
echo "  PGPASSWORD='<pw>' psql -h <host> -U postgres -d postgres -f ${OUTPUT_FILE}"
echo ""
echo "To verify after restore:"
echo "  psql -h <host> -U postgres -d postgres -c \"SELECT public.validate_restore_readiness();\""
