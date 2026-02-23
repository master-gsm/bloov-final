/*
  # Fix payroll_items ON CONFLICT index

  ## Problem
  The function generate_payroll_run uses:
    ON CONFLICT (payroll_run_id, employee_id) DO NOTHING
  But payroll_items has no UNIQUE index on (payroll_run_id, employee_id),
  causing: "there is no unique or exclusion constraint matching the ON CONFLICT specification"

  ## Fix
  Add the missing UNIQUE index on payroll_items(payroll_run_id, employee_id).
  No logic changes to any function.
*/

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_items_run_employee
  ON payroll_items (payroll_run_id, employee_id);
