/*
  # Add Missing Foreign Key Indexes - Batch 1

  1. Performance
    - Adds indexes on foreign key columns that were missing covering indexes
    - Covers tables: accounting_periods, activity_log, ai_analysis_logs, ai_forecasts,
      audit_logs, bank_accounts, bouquet_components, branch_stock, branches,
      cash_registers, cash_shifts, cash_transactions, categories, chart_of_accounts,
      commission_accruals, compensation_plans, custody_settlements, customer_payments,
      customers, employee_commissions

  2. Important Notes
    - Uses IF NOT EXISTS to prevent errors on re-runs
    - These indexes improve JOIN and DELETE performance on foreign key lookups
*/

CREATE INDEX IF NOT EXISTS idx_accounting_periods_closed_by ON public.accounting_periods (closed_by);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON public.activity_log (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_logs_created_by ON public.ai_analysis_logs (created_by);
CREATE INDEX IF NOT EXISTS idx_ai_forecasts_product_id ON public.ai_forecasts (product_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_branch_id ON public.audit_logs (branch_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_branch_id ON public.bank_accounts (branch_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_gl_account_id ON public.bank_accounts (gl_account_id);
CREATE INDEX IF NOT EXISTS idx_bouquet_components_component_product_id ON public.bouquet_components (component_product_id);
CREATE INDEX IF NOT EXISTS idx_branch_stock_product_id ON public.branch_stock (product_id);
CREATE INDEX IF NOT EXISTS idx_branches_manager_id ON public.branches (manager_id);
CREATE INDEX IF NOT EXISTS idx_cash_registers_closed_by ON public.cash_registers (closed_by);
CREATE INDEX IF NOT EXISTS idx_cash_registers_opened_by ON public.cash_registers (opened_by);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_user_id ON public.cash_shifts (user_id);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_voided_by ON public.cash_shifts (voided_by);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_shift_id ON public.cash_transactions (shift_id);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_voided_by ON public.cash_transactions (voided_by);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON public.categories (parent_id);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_branch_id ON public.chart_of_accounts (branch_id);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_created_by ON public.chart_of_accounts (created_by);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_parent_account_id ON public.chart_of_accounts (parent_account_id);
CREATE INDEX IF NOT EXISTS idx_commission_accruals_employee_id ON public.commission_accruals (employee_id);
CREATE INDEX IF NOT EXISTS idx_commission_accruals_payroll_run_id ON public.commission_accruals (payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_compensation_plans_branch_id ON public.compensation_plans (branch_id);
CREATE INDEX IF NOT EXISTS idx_compensation_plans_created_by ON public.compensation_plans (created_by);
CREATE INDEX IF NOT EXISTS idx_custody_settlements_created_by ON public.custody_settlements (created_by);
CREATE INDEX IF NOT EXISTS idx_custody_settlements_journal_entry_id ON public.custody_settlements (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_custody_settlements_voided_by ON public.custody_settlements (voided_by);
CREATE INDEX IF NOT EXISTS idx_customer_payments_branch_id ON public.customer_payments (branch_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_customer_id ON public.customer_payments (customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_branch_id ON public.customers (branch_id);
CREATE INDEX IF NOT EXISTS idx_customers_created_by ON public.customers (created_by);
CREATE INDEX IF NOT EXISTS idx_employee_commissions_branch_id ON public.employee_commissions (branch_id);
CREATE INDEX IF NOT EXISTS idx_employee_commissions_employee_id ON public.employee_commissions (employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_commissions_payment_id ON public.employee_commissions (payment_id);
