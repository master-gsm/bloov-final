-- =============================================================================
-- Bloov Accounting — Deterministic Restore Reference
-- =============================================================================
-- This file documents the exact failure analysis, correct restore order,
-- and pre/post-restore verification queries.
--
-- All queries are READ-ONLY. No writes.
-- =============================================================================


-- =============================================================================
-- SECTION 1: Why plain alphabetical restore fails (13 tables)
-- =============================================================================
--
-- pg_dump without explicit ordering restores tables alphabetically.
-- The following FK relationships break that ordering:
--
--  #  Child Table            FK Column                Parent Table          Delete Rule  Problem
--  ── ────────────────────── ──────────────────────── ───────────────────── ──────────── ──────────────────────────
--  1  branches               manager_id               users                 NO ACTION    branches (b) before users (u)
--  2  users                  branch_id                branches              SET NULL     CIRCULAR with #1
--  3  accounts               parent_id                accounts (self)       NO ACTION    SELF-REF, needs deferred
--  4  journal_entries        original_entry_id        journal_entries(self) NO ACTION    SELF-REF, needs deferred
--  4  journal_entries        reverse_entry_id         journal_entries(self) NO ACTION    SELF-REF, needs deferred
--  5  journal_lines          journal_entry_id         journal_entries       RESTRICT     journal_lines (jl) before journal_entries (je)
--  6  sale_items             product_id               products              RESTRICT     RESTRICT prevents restore if product missing
--  7  purchase_items         product_id               products              RESTRICT     RESTRICT prevents restore if product missing
--  8  commission_accruals    sale_id                  sales                 RESTRICT     commission_accruals (ca) before sales (s)
--  8  commission_accruals    employee_id              employees             RESTRICT     employees also needed
--  9  employees              user_id                  users                 RESTRICT     employees (e) before users (u)
-- 10  payroll_lines          payroll_run_id           payroll_runs          RESTRICT     payroll_lines (pl) before payroll_runs
-- 10  payroll_lines          employee_id              employees             RESTRICT     employees also needed
-- 11  purchase_receipts      purchase_id              purchases             RESTRICT     purchase_receipts before purchases
-- 12  operating_expenses     partner_contribution_id  partner_contributions CASCADE      operating_expenses before partner_contributions
-- 13  vat_transactions       vat_return_id            vat_returns           NO ACTION    vat_transactions before vat_returns


-- =============================================================================
-- SECTION 2: Correct restore dependency order (topological sort)
-- =============================================================================
--
-- Tier 0 — No FK parents (restore first):
--   roles, permissions, categories, branches*, products, suppliers, partners
--   vat_returns, accounting_periods, loyalty_settings, settings, salla_orders
--
-- * branches has manager_id → users, but users also needs branches.
--   Use SET CONSTRAINTS ALL DEFERRED to break this circular dependency.
--
-- Tier 1 — Depends on Tier 0:
--   users (branch_id → branches), accounts (parent_id self-FK),
--   profiles (role_id → roles), role_permissions, customers
--
-- Tier 2 — Depends on Tier 1:
--   branches (update manager_id after users loaded),
--   employees (user_id → users), chart_of_accounts,
--   bank_accounts, branch_settings, branch_stock
--
-- Tier 3 — Depends on Tier 2:
--   inventory, product_costing, product_recipes, bouquet_components,
--   cash_registers, cash_shifts, payroll_runs,
--   purchases, sales (customer_id→customers, salesperson_id→employees)
--
-- Tier 4 — Depends on Tier 3:
--   sale_items, purchase_items, cash_transactions,
--   partner_contributions, journal_entries (self-FK deferred),
--   payroll_items, payroll_lines, employee_leaves, employee_loans,
--   employee_settlements, salary_payments
--
-- Tier 5 — Depends on Tier 4:
--   journal_lines (journal_entry_id RESTRICT),
--   sale_item_materials, inventory_movements,
--   commission_accruals (sale_id+employee_id RESTRICT),
--   purchase_receipts (purchase_id RESTRICT),
--   operating_expenses (partner_contribution_id CASCADE),
--   employee_commissions, compensation_plans,
--   vat_transactions (vat_return_id)
--
-- Tier 6 — Depends on Tier 5:
--   expenses, fixed_assets, depreciation_entries,
--   invoices, invoice_items, invoice_payments,
--   customer_payments, customer_loyalty, loyalty_transactions,
--   loyalty_point_transactions, partner_distributions, partner_settlements,
--   setup_expenses, wastage, salla_order_items, event_orders,
--   bank_statement_imports, reconciliation_matches
--
-- Tier 7 — Audit / Logging (restore last):
--   audit_log, audit_logs, activity_log, ai_analysis_logs,
--   ai_forecasts, ai_insights, sms_logs, register_transactions,
--   transactions, cash_flow_mapping


-- =============================================================================
-- SECTION 3: The fix — SET CONSTRAINTS ALL DEFERRED
-- =============================================================================
--
-- The export script (export-database.sh) wraps ALL COPY blocks inside:
--
--   BEGIN;
--   SET CONSTRAINTS ALL DEFERRED;
--   ... all COPY statements ...
--   SET CONSTRAINTS ALL IMMEDIATE;  -- forces validation before COMMIT
--   COMMIT;
--
-- This means:
--   - FK checks are deferred until COMMIT
--   - All 13 circular/RESTRICT/self-reference chains are resolved atomically
--   - If any FK is violated (real data integrity problem), COMMIT will ROLLBACK
--   - Result: 100% deterministic restore


-- =============================================================================
-- SECTION 4: Pre-Export Integrity Check
-- =============================================================================
-- Run this before every export. All results must show 0 failures.

SELECT public.validate_restore_readiness();
-- Expected: { "failed_checks": 0, "total_checks": 24 }


-- =============================================================================
-- SECTION 5: Full Export Command
-- =============================================================================
-- Use the shell script which handles the SET CONSTRAINTS wrapping:
--
-- PGPASSWORD="<password>" bash scripts/export-database.sh \
--   --host "db.<project-ref>.supabase.co" \
--   --user postgres \
--   --dbname postgres
--
-- Alternatively, manual pg_dump (section-by-section):
--
-- PGPASSWORD="<password>" pg_dump \
--   --host="db.<project-ref>.supabase.co" \
--   --port=5432 \
--   --username="postgres" \
--   --dbname="postgres" \
--   --schema=public \
--   --no-owner --no-privileges --no-comments \
--   --format=plain --encoding=UTF8 \
--   --exclude-table-data="public.audit_logs" \
--   --file="bloov_raw_$(date +%Y%m%d_%H%M%S).sql"
--
-- Then prepend BEGIN; SET CONSTRAINTS ALL DEFERRED;
-- and append SET CONSTRAINTS ALL IMMEDIATE; COMMIT;


-- =============================================================================
-- SECTION 6: Restore Command
-- =============================================================================
-- PGPASSWORD="<password>" psql \
--   --host="db.<new-project-ref>.supabase.co" \
--   --port=5432 \
--   --username="postgres" \
--   --dbname="postgres" \
--   --file="bloov_export_YYYYMMDD_HHMMSS.sql"


-- =============================================================================
-- SECTION 7: Post-Restore Verification
-- =============================================================================

-- 7a. Run the full restore validator (24 checks):
SELECT public.validate_restore_readiness();
-- Expected: { "failed_checks": 0 }

-- 7b. Confirm trial balance is zero:
SELECT ROUND(SUM(jl.debit) - SUM(jl.credit), 4) AS trial_balance_diff
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.journal_entry_id
WHERE je.status = 'Posted' AND je.voided_at IS NULL;
-- Expected: 0.0000

-- 7c. Confirm row counts match pre-export snapshot:
SELECT
  (SELECT count(*) FROM sales)            AS sales,
  (SELECT count(*) FROM purchases)        AS purchases,
  (SELECT count(*) FROM journal_entries)  AS journal_entries,
  (SELECT count(*) FROM inventory)        AS inventory,
  (SELECT count(*) FROM vat_transactions) AS vat_transactions,
  (SELECT count(*) FROM payroll_runs)     AS payroll_runs;

-- 7d. Confirm no orphan account nodes:
SELECT code, name FROM accounts
WHERE parent_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM accounts p WHERE p.id = accounts.parent_id);
-- Expected: 0 rows
