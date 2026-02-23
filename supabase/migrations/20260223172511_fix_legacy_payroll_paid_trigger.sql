
-- Replace the broken legacy trigger function with a safe no-op.
-- pay_payroll_run() already handles GL posting via the Draft→Lines→Posted pattern.
-- This legacy trigger referenced chart_of_accounts.name_ar which no longer exists.
CREATE OR REPLACE FUNCTION create_journal_entry_on_payroll_paid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Legacy trigger: GL is now handled directly inside pay_payroll_run().
  -- This function is intentionally a no-op to prevent conflicts.
  RETURN NEW;
END;
$$;
