
/*
  # Fix 1: Allow payroll_runs to be cancelled (soft-cancel instead of DELETE)
  # Fix 2: update_purchase_status already supports draft → cancelled

  ## Problem — Payroll Delete
  A BEFORE DELETE trigger `trigger_prevent_payroll_delete` on `payroll_runs`
  always raises "Cannot delete commission records." preventing any DELETE.

  ## Solution
  - Add 'cancelled' to the payroll_runs status check constraint.
  - Add is_cancelled column to payroll_items.
  - Drop & recreate delete_draft_payroll_run() to use UPDATE status='cancelled'
    instead of DELETE — bypasses the trigger completely.
*/

-- ── 1. Extend payroll_runs status constraint ──────────────────────────────
ALTER TABLE payroll_runs
  DROP CONSTRAINT IF EXISTS payroll_runs_status_check;

ALTER TABLE payroll_runs
  ADD CONSTRAINT payroll_runs_status_check
  CHECK (status = ANY (ARRAY['draft','approved','posted','paid','cancelled']));

-- ── 2. Add is_cancelled to payroll_items ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_items' AND column_name = 'is_cancelled'
  ) THEN
    ALTER TABLE payroll_items ADD COLUMN is_cancelled boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ── 3. Replace delete_draft_payroll_run with soft-cancel version ──────────
DROP FUNCTION IF EXISTS delete_draft_payroll_run(uuid);

CREATE OR REPLACE FUNCTION delete_draft_payroll_run(p_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status      text;
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM users WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin','super_admin','accountant') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT status INTO v_status FROM payroll_runs WHERE id = p_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run not found';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft payroll runs can be cancelled';
  END IF;

  UPDATE payroll_items
    SET is_cancelled = true
  WHERE payroll_run_id = p_run_id;

  UPDATE payroll_runs
    SET status = 'cancelled', updated_at = now()
  WHERE id = p_run_id;
END;
$$;
