/*
  # Fix safe_delete_user: allow NULL in user reference columns

  1. Modified Columns
    - `journal_entries.created_by` - changed from NOT NULL to nullable
    - `cash_transactions.created_by` - changed from NOT NULL to nullable
    - `cash_shifts.user_id` - changed from NOT NULL to nullable
    - `purchase_receipts.created_by` - changed from NOT NULL to nullable

  2. Why
    - When a user is deleted, their financial records must be preserved
    - These columns had NOT NULL constraints preventing user deletion
    - Setting them to NULL indicates the original user was removed

  3. Updated Function
    - `safe_delete_user` now also nullifies `cash_transactions.created_by`
      and `cash_shifts.user_id` before deleting the user profile
*/

ALTER TABLE journal_entries ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE cash_transactions ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE cash_shifts ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE purchase_receipts ALTER COLUMN created_by DROP NOT NULL;

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
  UPDATE cash_transactions SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE cash_shifts SET user_id = NULL WHERE user_id = p_user_id;

  DELETE FROM users WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.safe_delete_user(uuid) TO service_role;
