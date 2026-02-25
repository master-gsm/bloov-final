/*
  # Remove Unused Indexes - Batch 2 (HR, Payroll, Partners)

  1. Purpose
    - Continue removing unused indexes
    - Focus on HR, payroll, and partner modules

  2. Impact
    - Improved write performance
    - Reduced storage overhead
*/

-- Employees & HR
DROP INDEX IF EXISTS idx_employees_iqama_expiry;
DROP INDEX IF EXISTS idx_employees_is_active;
DROP INDEX IF EXISTS idx_employee_commissions_branch_id;
DROP INDEX IF EXISTS idx_employee_commissions_employee_id;
DROP INDEX IF EXISTS idx_employee_commissions_payment_id;
DROP INDEX IF EXISTS idx_employee_leaves_branch_id;
DROP INDEX IF EXISTS idx_employee_leaves_employee_id;
DROP INDEX IF EXISTS idx_employee_leaves_approved_by;
DROP INDEX IF EXISTS idx_employee_leaves_created_by;
DROP INDEX IF EXISTS idx_employee_loans_employee_id;
DROP INDEX IF EXISTS idx_employee_loans_branch_id;
DROP INDEX IF EXISTS idx_employee_loans_created_by;
DROP INDEX IF EXISTS idx_employee_settlements_branch_id;
DROP INDEX IF EXISTS idx_employee_settlements_employee_id;
DROP INDEX IF EXISTS idx_employee_settlements_approved_by;
DROP INDEX IF EXISTS idx_employee_settlements_created_by;

-- Payroll
DROP INDEX IF EXISTS idx_payroll_runs_branch_id;
DROP INDEX IF EXISTS idx_payroll_runs_created_by;
DROP INDEX IF EXISTS idx_payroll_runs_paid_by;
DROP INDEX IF EXISTS idx_payroll_runs_posted_by;
DROP INDEX IF EXISTS idx_payroll_runs_approved_by;
DROP INDEX IF EXISTS idx_payroll_items_employee_id;
DROP INDEX IF EXISTS idx_payroll_lines_employee_id;
DROP INDEX IF EXISTS idx_salary_payments_branch_id;
DROP INDEX IF EXISTS idx_salary_payments_employee_id;
DROP INDEX IF EXISTS idx_salary_payments_created_by;
DROP INDEX IF EXISTS idx_compensation_plans_branch_id;
DROP INDEX IF EXISTS idx_compensation_plans_created_by;
DROP INDEX IF EXISTS idx_commission_accruals_employee_id;
DROP INDEX IF EXISTS idx_commission_accruals_payroll_run_id;

-- Partners
DROP INDEX IF EXISTS idx_partner_withdrawals_partner_id;
DROP INDEX IF EXISTS idx_partner_withdrawals_branch_id;
DROP INDEX IF EXISTS idx_partner_withdrawals_created_by;
DROP INDEX IF EXISTS idx_partner_withdrawals_journal_entry_id;
DROP INDEX IF EXISTS idx_profit_distributions_partner_id;
DROP INDEX IF EXISTS idx_profit_distributions_branch_id;
DROP INDEX IF EXISTS idx_profit_distributions_created_by;
DROP INDEX IF EXISTS idx_profit_distributions_journal_entry_id;
DROP INDEX IF EXISTS idx_partner_contributions_created_by;
DROP INDEX IF EXISTS idx_partner_contributions_partner_id;
DROP INDEX IF EXISTS idx_partner_contributions_voided_by;
DROP INDEX IF EXISTS idx_partner_distributions_created_by;
DROP INDEX IF EXISTS idx_partner_distributions_partner_id;
DROP INDEX IF EXISTS idx_partner_settlements_from_partner_id;
DROP INDEX IF EXISTS idx_partner_settlements_to_partner_id;
DROP INDEX IF EXISTS idx_partner_settlements_voided_by;

-- Fixed Assets
DROP INDEX IF EXISTS idx_fixed_assets_created_by;
DROP INDEX IF EXISTS idx_fixed_assets_supplier_id;
DROP INDEX IF EXISTS idx_fixed_assets_voided_by;

-- Cash Register
DROP INDEX IF EXISTS idx_cash_registers_closed_by;
DROP INDEX IF EXISTS idx_cash_registers_opened_by;
DROP INDEX IF EXISTS idx_cash_shifts_user_id;
DROP INDEX IF EXISTS idx_cash_shifts_voided_by;
DROP INDEX IF EXISTS idx_cash_transactions_shift_id;
DROP INDEX IF EXISTS idx_cash_transactions_voided_by;

-- Bank & Reconciliation
DROP INDEX IF EXISTS idx_bank_accounts_branch_id;
DROP INDEX IF EXISTS idx_bank_accounts_gl_account_id;

-- Notifications & Audit
DROP INDEX IF EXISTS idx_notifications_user_id;
DROP INDEX IF EXISTS idx_notifications_is_read;
DROP INDEX IF EXISTS idx_notifications_created_at;
DROP INDEX IF EXISTS idx_notifications_roles;
DROP INDEX IF EXISTS idx_audit_logs_table_record;
DROP INDEX IF EXISTS idx_audit_logs_user_recent;
DROP INDEX IF EXISTS idx_audit_logs_branch_id;
DROP INDEX IF EXISTS idx_activity_log_user_id;
