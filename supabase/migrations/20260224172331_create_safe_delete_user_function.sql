/*
  # Create safe_delete_user function

  This function safely deletes a user by:
  1. Setting bypass_immutable flag to handle financial table triggers
  2. Nullifying all foreign key references across all tables
  3. Deleting the employee record linked to the user
  4. Deleting the user profile from the users table
  
  The auth user deletion is handled separately by the edge function using the Admin API.
*/

CREATE OR REPLACE FUNCTION public.safe_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL app.bypass_immutable = 'true';

  UPDATE inventory SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE inventory SET updated_by = NULL WHERE updated_by = p_user_id;
  UPDATE inventory_movements SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE customers SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE sales SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE suppliers SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE purchases SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE purchase_receipts SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE setup_expenses SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE employee_loans SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE compensation_plans SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE salary_payments SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE employee_leaves SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE employee_leaves SET approved_by = NULL WHERE approved_by = p_user_id;
  UPDATE employee_settlements SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE employee_settlements SET approved_by = NULL WHERE approved_by = p_user_id;
  UPDATE payroll_runs SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE payroll_runs SET paid_by = NULL WHERE paid_by = p_user_id;
  UPDATE payroll_runs SET approved_by = NULL WHERE approved_by = p_user_id;
  UPDATE payroll_runs SET posted_by = NULL WHERE posted_by = p_user_id;
  UPDATE journal_entries SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE journal_entries SET posted_by = NULL WHERE posted_by = p_user_id;
  UPDATE journal_entries SET voided_by = NULL WHERE voided_by = p_user_id;
  UPDATE accounting_periods SET closed_by = NULL WHERE closed_by = p_user_id;
  UPDATE audit_logs SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE branches SET manager_id = NULL WHERE manager_id = p_user_id;
  UPDATE employees SET user_id = NULL WHERE user_id = p_user_id;

  DELETE FROM users WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.safe_delete_user(uuid) TO service_role;
