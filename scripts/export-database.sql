-- =============================================================================
-- Bloov Accounting — Production-Safe SQL Export Reference
-- =============================================================================
-- This file documents the exact pg_dump command and manual SQL queries
-- to create a portable export of the Bloov Accounting database.
--
-- IMPORTANT: This script is READ-ONLY. It contains no writes or destructive ops.
-- Run against a live database to produce a snapshot for disaster recovery.
-- =============================================================================


-- =============================================================================
-- SECTION 1: Health Pre-Check (run before export)
-- =============================================================================

-- 1a. Confirm trial balance is zero before exporting
SELECT
  ROUND(SUM(jl.debit) - SUM(jl.credit), 4) AS trial_balance_diff
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.journal_entry_id
WHERE je.status = 'Posted'
  AND je.voided_at IS NULL;
-- Expected: 0.0000 — if non-zero, investigate before backup.


-- 1b. Confirm no orphan sale items
SELECT count(*) AS orphan_sale_items
FROM sale_items si
WHERE NOT EXISTS (SELECT 1 FROM sales s WHERE s.id = si.sale_id);
-- Expected: 0


-- 1c. Confirm no orphan purchase items
SELECT count(*) AS orphan_purchase_items
FROM purchase_items pi
WHERE NOT EXISTS (SELECT 1 FROM purchases p WHERE p.id = pi.purchase_id);
-- Expected: 0


-- 1d. Confirm no duplicate VAT transactions
SELECT source_type, source_id, vat_type, count(*) AS cnt
FROM vat_transactions
GROUP BY source_type, source_id, vat_type
HAVING count(*) > 1;
-- Expected: 0 rows


-- =============================================================================
-- SECTION 2: Row Count Snapshot (embed in backup metadata)
-- =============================================================================

SELECT
  (SELECT count(*) FROM sales)            AS sales,
  (SELECT count(*) FROM purchases)        AS purchases,
  (SELECT count(*) FROM journal_entries)  AS journal_entries,
  (SELECT count(*) FROM inventory)        AS inventory,
  (SELECT count(*) FROM vat_transactions) AS vat_transactions,
  (SELECT count(*) FROM payroll_runs)     AS payroll_runs,
  (SELECT count(*) FROM expenses)         AS expenses,
  (SELECT count(*) FROM customers)        AS customers,
  (SELECT count(*) FROM products)         AS products;


-- =============================================================================
-- SECTION 3: Full Schema + Data Export Command (shell)
-- =============================================================================
-- Run this from a terminal with pg_dump installed.
-- Replace DB_HOST / DB_USER / PGPASSWORD with real values.
--
-- PGPASSWORD="<password>" pg_dump \
--   --host="db.<project-ref>.supabase.co" \
--   --port=5432 \
--   --username="postgres" \
--   --dbname="postgres" \
--   --schema=public \
--   --no-owner \
--   --no-privileges \
--   --no-comments \
--   --format=plain \
--   --encoding=UTF8 \
--   --exclude-table-data="public.audit_logs" \
--   --file="bloov_export_$(date +%Y%m%d_%H%M%S).sql"
--
-- Excluded from data (schema only): public.audit_logs
-- Excluded entirely: auth.*, storage.*, _realtime.*, supabase_migrations.*


-- =============================================================================
-- SECTION 4: Restore Command
-- =============================================================================
-- PGPASSWORD="<password>" psql \
--   --host="db.<new-project-ref>.supabase.co" \
--   --port=5432 \
--   --username="postgres" \
--   --dbname="postgres" \
--   --file="bloov_export_YYYYMMDD_HHMMSS.sql"


-- =============================================================================
-- SECTION 5: Post-Restore Verification
-- =============================================================================

-- Re-run all Section 1 queries on the restored database.
-- Additionally verify account tree integrity:
SELECT
  a.code,
  a.name,
  a.account_type
FROM accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM accounts parent WHERE parent.id = a.parent_id
) AND a.parent_id IS NOT NULL;
-- Expected: 0 rows (no orphan account nodes)
