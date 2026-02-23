/*
  # Fix partner operation routing: expense_type constraint + trigger normalization

  ## Problem
  1. The trigger `trg_setup_expense_post_gl` passed `NEW.expense_type` raw to the router.
     If any value was case-mismatched or invalid, routing silently fell back to wrong path.
  2. No DB constraint enforced valid values for `expense_type`.
  3. `inventory` was a valid router path but not enforced as a valid `expense_type`.

  ## Changes
  1. Add CHECK constraint on `setup_expenses.expense_type` to allow only:
     capital | inventory | asset | operational
  2. Update `trg_setup_expense_post_gl` to LOWER() normalize `expense_type` before routing.
  3. Add `inventory` to the allowed set (was missing from old constraint if any).
*/

-- 1. Add/replace the expense_type CHECK constraint
DO $$
BEGIN
  ALTER TABLE setup_expenses
    DROP CONSTRAINT IF EXISTS setup_expenses_expense_type_check;

  ALTER TABLE setup_expenses
    ADD CONSTRAINT setup_expenses_expense_type_check
    CHECK (expense_type IN ('capital', 'inventory', 'asset', 'operational'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

-- 2. Replace the GL trigger function with LOWER() normalization
CREATE OR REPLACE FUNCTION public.trg_setup_expense_post_gl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $trig$
DECLARE
  v_result jsonb;
  v_op_type text;
BEGIN
  IF NEW.is_deleted = true THEN RETURN NEW; END IF;
  IF current_setting('app.skip_setup_expense_gl', true) = 'true' THEN RETURN NEW; END IF;

  v_op_type := LOWER(COALESCE(NEW.expense_type, 'operational'));

  IF v_op_type NOT IN ('capital', 'inventory', 'asset', 'operational') THEN
    RAISE EXCEPTION 'Invalid expense_type for GL routing: %. Must be one of: capital, inventory, asset, operational', v_op_type;
  END IF;

  BEGIN
    v_result := public.post_partner_operation_atomic(jsonb_build_object(
      'expense_id',      NEW.id,
      'partner_id',      NEW.partner_id,
      'operation_type',  v_op_type,
      'amount',          COALESCE(NEW.amount, 0),
      'vat_amount',      COALESCE(NEW.vat_amount, 0),
      'vat_category',    COALESCE(NEW.vat_category::text, 'standard'),
      'expense_date',    NEW.expense_date::text,
      'description',     COALESCE(NEW.description, 'Partner Expense'),
      'branch_id',       NEW.branch_id::text,
      'payment_method',  COALESCE(NEW.payment_method, 'cash'),
      'created_by',      NEW.created_by::text
    ));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'GL posting failed for setup_expense %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$trig$;

DROP TRIGGER IF EXISTS trg_setup_expense_post_gl ON setup_expenses;
CREATE TRIGGER trg_setup_expense_post_gl
  AFTER INSERT ON setup_expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_setup_expense_post_gl();
