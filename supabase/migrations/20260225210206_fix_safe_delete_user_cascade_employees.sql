/*
  # Fix user deletion to also remove linked employee records

  1. Changes
    - Updated `safe_delete_user` function to delete the linked employee record
      instead of just nullifying `user_id`
    - Nullifies `salesperson_id` on sales before deleting employee to avoid
      optimistic lock conflicts
    - Employee cascade will auto-delete: commissions, salary_payments, 
      payroll_items, leaves, loans, settlements

  2. Cleanup
    - Removes existing orphaned employee records (user_id IS NULL) 
      that were left behind by previous deletions

  3. Important Notes
    - The `app.bypass_immutable` setting is used to bypass optimistic lock
      triggers during cleanup
    - Sales records are preserved; only the salesperson reference is cleared
*/

CREATE OR REPLACE FUNCTION public.safe_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
BEGIN
  SET LOCAL app.bypass_immutable = 'true';

  SELECT id INTO v_employee_id FROM employees WHERE user_id = p_user_id;

  IF v_employee_id IS NOT NULL THEN
    UPDATE sales SET salesperson_id = NULL WHERE salesperson_id = v_employee_id;
    DELETE FROM employees WHERE id = v_employee_id;
  END IF;

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

DO $$
DECLARE
  v_emp RECORD;
BEGIN
  SET LOCAL app.bypass_immutable = 'true';
  
  FOR v_emp IN SELECT id FROM employees WHERE user_id IS NULL
  LOOP
    UPDATE sales SET salesperson_id = NULL WHERE salesperson_id = v_emp.id;
    DELETE FROM employees WHERE id = v_emp.id;
  END LOOP;
END;
$$;
