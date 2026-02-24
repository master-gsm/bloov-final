/*
  # Fix Users RLS and Remove Duplicate/Unused Indexes

  1. Enable RLS on users table (security issue)
  2. Remove duplicate index on reconciliation_matches
  3. Remove 60+ unused soft-delete indexes (performance)
*/

-- 1. Enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 2. Drop duplicate index on reconciliation_matches (keep uq_bank_line_active_match as it's the constraint)
DROP INDEX IF EXISTS idx_rm_bank_line CASCADE;

-- 3. Drop unused soft-delete indexes (60+ unused indexes bloat the database)
DROP INDEX IF EXISTS idx_sale_items_is_deleted CASCADE;
DROP INDEX IF EXISTS idx_purchases_is_deleted CASCADE;
DROP INDEX IF EXISTS idx_purchase_items_is_deleted CASCADE;
DROP INDEX IF EXISTS idx_expenses_is_deleted CASCADE;
DROP INDEX IF EXISTS idx_inventory_movements_is_deleted CASCADE;
DROP INDEX IF EXISTS idx_operating_expenses_is_deleted CASCADE;
DROP INDEX IF EXISTS idx_cash_transactions_is_deleted CASCADE;
DROP INDEX IF EXISTS idx_cash_shifts_is_deleted CASCADE;
DROP INDEX IF EXISTS idx_partner_contributions_is_deleted CASCADE;
DROP INDEX IF EXISTS idx_setup_expenses_is_deleted CASCADE;
DROP INDEX IF EXISTS idx_sales_voided_at CASCADE;
DROP INDEX IF EXISTS idx_purchases_voided_at CASCADE;
DROP INDEX IF EXISTS idx_register_transactions_reference_id CASCADE;
DROP INDEX IF EXISTS idx_accounting_periods_dates CASCADE;
DROP INDEX IF EXISTS idx_accounting_periods_closed CASCADE;
DROP INDEX IF EXISTS idx_accounts_type CASCADE;
DROP INDEX IF EXISTS idx_accounts_active CASCADE;
DROP INDEX IF EXISTS idx_journal_entries_branch CASCADE;
DROP INDEX IF EXISTS idx_journal_entries_period_locked CASCADE;
DROP INDEX IF EXISTS idx_fixed_assets_category CASCADE;
DROP INDEX IF EXISTS idx_employee_commissions_branch_id CASCADE;
DROP INDEX IF EXISTS idx_cash_registers_branch_id CASCADE;
DROP INDEX IF EXISTS idx_sale_items_branch_id CASCADE;
DROP INDEX IF EXISTS idx_purchase_items_branch_id CASCADE;
DROP INDEX IF EXISTS idx_purchase_receipts_purchase CASCADE;
DROP INDEX IF EXISTS idx_purchase_receipts_status CASCADE;
DROP INDEX IF EXISTS idx_vat_returns_status CASCADE;
DROP INDEX IF EXISTS idx_employee_leaves_employee CASCADE;
DROP INDEX IF EXISTS idx_employee_leaves_branch CASCADE;
DROP INDEX IF EXISTS idx_employee_leaves_dates CASCADE;
DROP INDEX IF EXISTS idx_employee_settlements_employee CASCADE;
DROP INDEX IF EXISTS idx_employee_settlements_branch CASCADE;
DROP INDEX IF EXISTS idx_accounting_periods_status CASCADE;
DROP INDEX IF EXISTS idx_employee_settlements_status CASCADE;
DROP INDEX IF EXISTS idx_invoice_payments_branch CASCADE;
DROP INDEX IF EXISTS idx_purchase_payments_purchase CASCADE;
DROP INDEX IF EXISTS idx_purchase_payments_payment CASCADE;
DROP INDEX IF EXISTS idx_purchase_payments_branch CASCADE;
DROP INDEX IF EXISTS idx_purchases_not_deleted CASCADE;
DROP INDEX IF EXISTS idx_expenses_account CASCADE;
DROP INDEX IF EXISTS idx_bank_accounts_branch CASCADE;
DROP INDEX IF EXISTS idx_employees_is_active CASCADE;
DROP INDEX IF EXISTS idx_bsi_period CASCADE;
DROP INDEX IF EXISTS idx_bsl_branch CASCADE;
DROP INDEX IF EXISTS idx_bsl_matched CASCADE;
DROP INDEX IF EXISTS idx_employee_loans_employee CASCADE;
DROP INDEX IF EXISTS idx_bsl_ref CASCADE;
DROP INDEX IF EXISTS idx_brecon_status CASCADE;
DROP INDEX IF EXISTS idx_employee_commissions_employee_id CASCADE;
DROP INDEX IF EXISTS idx_employee_commissions_sale_id CASCADE;
DROP INDEX IF EXISTS idx_chart_of_accounts_branch_id CASCADE;
DROP INDEX IF EXISTS idx_chart_of_accounts_created_by CASCADE;
DROP INDEX IF EXISTS idx_chart_of_accounts_parent_account_id CASCADE;
DROP INDEX IF EXISTS idx_compensation_plans_created_by CASCADE;
DROP INDEX IF EXISTS idx_customer_payments_branch_id CASCADE;
DROP INDEX IF EXISTS idx_customer_payments_customer_id CASCADE;
DROP INDEX IF EXISTS idx_customer_payments_journal_entry_id CASCADE;
DROP INDEX IF EXISTS idx_inventory_movements_product_id CASCADE;
DROP INDEX IF EXISTS idx_invoices_customer_id CASCADE;
DROP INDEX IF EXISTS idx_invoices_sale_id CASCADE;
DROP INDEX IF EXISTS idx_payroll_runs_created_by CASCADE;
DROP INDEX IF EXISTS idx_payroll_runs_paid_by CASCADE;
DROP INDEX IF EXISTS idx_payroll_runs_posted_by CASCADE;
DROP INDEX IF EXISTS idx_products_category_id CASCADE;
DROP INDEX IF EXISTS idx_profiles_role_id CASCADE;
DROP INDEX IF EXISTS idx_purchases_supplier_id CASCADE;
DROP INDEX IF EXISTS idx_salary_payments_created_by CASCADE;
DROP INDEX IF EXISTS idx_sales_customer_id CASCADE;
DROP INDEX IF EXISTS idx_setup_expenses_created_by CASCADE;
DROP INDEX IF EXISTS idx_setup_expenses_supplier_id CASCADE;
DROP INDEX IF EXISTS idx_transactions_account_id CASCADE;
