/*
  # Fix safe_delete_user function with correct FK columns

  Rebuilds the function using only the actual FK columns that exist in the database.
*/

CREATE OR REPLACE FUNCTION public.safe_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL app.bypass_immutable = 'true';

  UPDATE inventory SET updated_by = NULL WHERE updated_by = p_user_id;
  UPDATE accounting_periods SET closed_by = NULL WHERE closed_by = p_user_id;
  UPDATE audit_logs SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE branches SET manager_id = NULL WHERE manager_id = p_user_id;
  UPDATE compensation_plans SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE employee_leaves SET approved_by = NULL WHERE approved_by = p_user_id;
  UPDATE employee_leaves SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE employee_loans SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE employee_settlements SET approved_by = NULL WHERE approved_by = p_user_id;
  UPDATE employee_settlements SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE employees SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE journal_entries SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE journal_entries SET posted_by = NULL WHERE posted_by = p_user_id;
  UPDATE journal_entries SET voided_by = NULL WHERE voided_by = p_user_id;
  UPDATE payroll_runs SET approved_by = NULL WHERE approved_by = p_user_id;
  UPDATE payroll_runs SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE payroll_runs SET paid_by = NULL WHERE paid_by = p_user_id;
  UPDATE payroll_runs SET posted_by = NULL WHERE posted_by = p_user_id;
  UPDATE purchase_receipts SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE salary_payments SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE setup_expenses SET created_by = NULL WHERE created_by = p_user_id;

  DELETE FROM users WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.safe_delete_user(uuid) TO service_role;
