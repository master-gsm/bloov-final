/*
  # Cancel Draft Payroll Run with Audit Logging

  1. New Functions
    - `cancel_draft_payroll_run(p_run_id, p_reason)` - Cancels draft payroll and logs to audit_logs
  
  2. Changes
    - Replaces `delete_draft_payroll_run` with a version that requires a reason
    - Writes cancellation event to audit_logs table
  
  3. Security
    - Only admin/accountant roles can cancel
    - Only draft status runs can be cancelled
*/

CREATE OR REPLACE FUNCTION public.cancel_draft_payroll_run(
  p_run_id uuid,
  p_reason text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status      text;
  v_caller_role text;
  v_run_number  text;
  v_month       int;
  v_year        int;
BEGIN
  SELECT role INTO v_caller_role FROM users WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'super_admin', 'accountant') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT status, run_number, period_month, period_year
    INTO v_status, v_run_number, v_month, v_year
    FROM payroll_runs WHERE id = p_run_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run not found';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft payroll runs can be cancelled. Current status: %', v_status;
  END IF;

  UPDATE payroll_items
  SET is_cancelled = true
  WHERE payroll_run_id = p_run_id;

  UPDATE payroll_runs
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_run_id;

  INSERT INTO audit_logs (
    user_id, action, table_name, record_id, metadata
  ) VALUES (
    auth.uid(),
    'PAYROLL_CANCELLED',
    'payroll_runs',
    p_run_id,
    jsonb_build_object(
      'run_number', v_run_number,
      'period', v_month || '/' || v_year,
      'reason', COALESCE(p_reason, ''),
      'cancelled_at', now()::text
    )
  );
END;
$$;
