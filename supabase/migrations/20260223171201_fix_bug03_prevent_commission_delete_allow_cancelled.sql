/*
  # BUG-03 (Second Pass): prevent_commission_delete — Allow Deletion of Cancelled Payroll Runs

  ## Problem Discovered in Validation
  `prevent_commission_delete()` raises an unconditional exception with zero conditional logic.
  It is attached to ALL deletes on `payroll_runs`, blocking even cancelled run cleanup.
  `generate_payroll_run()` correctly tries to delete the cancelled run before regenerating,
  but this trigger blocks it with "Cannot delete commission records."

  ## Fix
  Allow deletion when OLD.status = 'cancelled'.
  Block all other deletions (draft/approved/paid) as before.

  ## Safety
  This is the minimum change needed. Only cancelled runs (which have no financial impact)
  can be deleted. Active/paid runs remain fully protected.
*/

CREATE OR REPLACE FUNCTION public.prevent_commission_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Allow deletion of cancelled payroll runs (needed for regeneration)
  IF TG_TABLE_NAME = 'payroll_runs' AND OLD.status = 'cancelled' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Cannot delete commission records. Use status change instead.';
  RETURN NULL;
END;
$function$;
