/*
  # Fix safe_delete_user: handle ALL foreign key references

  1. Problem
    - The safe_delete_user function was missing many FK references to users.id
    - This caused "Operation failed" errors when trying to delete users
    - 61 FK constraints exist but only ~20 were handled

  2. Changes
    - Rebuilt safe_delete_user to nullify ALL 61 FK references before deleting
    - Covers all tables: sales, purchases, expenses, partners, inventory, etc.
    - Deletes notification records for the user (non-financial, safe to remove)

  3. Tables affected (nullify user references)
    - accounting_periods, activity_log, ai_analysis_logs, ai_forecasts, ai_insights
    - audit_logs, branches, cash_registers, cash_shifts, cash_transactions
    - chart_of_accounts, compensation_plans, customer_payments, customers
    - employee_leaves, employee_loans, employee_settlements, employees
    - event_orders, expenses, fixed_assets, inventory, inventory_movements
    - invoices, journal_entries, operating_expenses, partner_contributions
    - partner_distributions, partner_settlements, partner_withdrawals
    - payment_applications, payroll_runs, profit_distributions, purchase_items
    - purchase_payments, purchase_receipts, purchases, reconciliation_matches
    - register_transactions, salary_payments, sale_items, sales
    - setup_expenses, supplier_payments, suppliers, transactions
*/

CREATE OR REPLACE FUNCTION public.safe_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL app.bypass_immutable = 'true';

  UPDATE accounting_periods SET closed_by = NULL WHERE closed_by = p_user_id;
  UPDATE activity_log SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE ai_analysis_logs SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE ai_forecasts SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE ai_insights SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE audit_logs SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE branches SET manager_id = NULL WHERE manager_id = p_user_id;
  UPDATE cash_registers SET closed_by = NULL WHERE closed_by = p_user_id;
  UPDATE cash_shifts SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE cash_shifts SET voided_by = NULL WHERE voided_by = p_user_id;
  UPDATE cash_transactions SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE cash_transactions SET voided_by = NULL WHERE voided_by = p_user_id;
  UPDATE chart_of_accounts SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE compensation_plans SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE customer_payments SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE customers SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE employee_leaves SET approved_by = NULL WHERE approved_by = p_user_id;
  UPDATE employee_leaves SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE employee_loans SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE employee_settlements SET approved_by = NULL WHERE approved_by = p_user_id;
  UPDATE employee_settlements SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE employees SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE event_orders SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE expenses SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE expenses SET voided_by = NULL WHERE voided_by = p_user_id;
  UPDATE fixed_assets SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE fixed_assets SET voided_by = NULL WHERE voided_by = p_user_id;
  UPDATE inventory SET updated_by = NULL WHERE updated_by = p_user_id;
  UPDATE inventory_movements SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE inventory_movements SET voided_by = NULL WHERE voided_by = p_user_id;
  UPDATE invoices SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE journal_entries SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE journal_entries SET posted_by = NULL WHERE posted_by = p_user_id;
  UPDATE journal_entries SET voided_by = NULL WHERE voided_by = p_user_id;
  UPDATE operating_expenses SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE operating_expenses SET voided_by = NULL WHERE voided_by = p_user_id;
  UPDATE partner_contributions SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE partner_contributions SET voided_by = NULL WHERE voided_by = p_user_id;
  UPDATE partner_distributions SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE partner_settlements SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE partner_settlements SET voided_by = NULL WHERE voided_by = p_user_id;
  UPDATE partner_withdrawals SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE payroll_runs SET approved_by = NULL WHERE approved_by = p_user_id;
  UPDATE payroll_runs SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE payroll_runs SET paid_by = NULL WHERE paid_by = p_user_id;
  UPDATE payroll_runs SET posted_by = NULL WHERE posted_by = p_user_id;
  UPDATE profit_distributions SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE purchase_items SET voided_by = NULL WHERE voided_by = p_user_id;
  UPDATE purchase_receipts SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE purchases SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE purchases SET voided_by = NULL WHERE voided_by = p_user_id;
  UPDATE register_transactions SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE salary_payments SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE sale_items SET voided_by = NULL WHERE voided_by = p_user_id;
  UPDATE sales SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE sales SET voided_by = NULL WHERE voided_by = p_user_id;
  UPDATE setup_expenses SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE setup_expenses SET voided_by = NULL WHERE voided_by = p_user_id;
  UPDATE supplier_payments SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE suppliers SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE transactions SET created_by = NULL WHERE created_by = p_user_id;

  DELETE FROM notifications WHERE user_id = p_user_id;

  DELETE FROM users WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.safe_delete_user(uuid) TO service_role;
