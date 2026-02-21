/*
  # Commission System Fix

  ## Summary
  The commission system was not working because employees had no compensation_plans records.
  This migration adds a direct commission_rate column to the employees table and rewrites
  the commission trigger to use it, making the system simple and reliable.

  ## Changes

  ### 1. employees table
  - Add `commission_rate` numeric column (percentage, e.g. 5 means 5%)
  - Default 0

  ### 2. employee_commissions table
  - Ensure unique constraint on sale_id + employee_id to prevent duplicates

  ### 3. New trigger function: `calculate_sale_commission()`
  - Fires on INSERT/UPDATE on sales
  - Only processes status = 'confirmed'
  - Reads commission_rate from employees.commission_rate (direct, no compensation_plans dependency)
  - commission_amount = total * commission_rate / 100
  - Idempotent: uses ON CONFLICT DO NOTHING

  ### 4. void_sale_commission() - cancel clears commission
  - On status change to cancelled/returned: marks commission as voided

  ### Security
  - No RLS changes
  - No role changes
  - No new policies
*/

-- ─────────────────────────────────────────────
-- 1. Add commission_rate to employees
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'commission_rate'
  ) THEN
    ALTER TABLE employees ADD COLUMN commission_rate numeric DEFAULT 0;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 2. Ensure unique constraint on employee_commissions
--    (one record per sale per employee)
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'employee_commissions'
    AND constraint_name = 'employee_commissions_sale_employee_unique'
  ) THEN
    ALTER TABLE employee_commissions
      ADD CONSTRAINT employee_commissions_sale_employee_unique
      UNIQUE (sale_id, employee_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 3. Drop all old commission triggers on sales
--    (duplicate / broken ones)
-- ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS trigger_calculate_commission ON sales;
DROP TRIGGER IF EXISTS trigger_calculate_commission_on_sale ON sales;
DROP TRIGGER IF EXISTS trigger_void_commission_on_cancel ON sales;
DROP TRIGGER IF EXISTS trigger_void_commission_on_sale_cancel ON sales;

-- ─────────────────────────────────────────────
-- 4. New clean commission calculation function
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION calculate_sale_commission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
  v_commission_rate numeric;
  v_commission_amount numeric;
  v_sale_channel text;
BEGIN
  -- Only process confirmed sales
  IF NEW.status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- On update, only reprocess if status just changed to confirmed
  IF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Resolve employee: prefer salesperson_id, fallback to user linked employee
  v_employee_id := NEW.salesperson_id;

  IF v_employee_id IS NULL THEN
    SELECT e.id INTO v_employee_id
    FROM employees e
    WHERE e.user_id = NEW.created_by
    AND e.is_active = true
    LIMIT 1;
  END IF;

  IF v_employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get commission rate from employees table directly
  SELECT commission_rate INTO v_commission_rate
  FROM employees
  WHERE id = v_employee_id;

  -- Skip if no rate configured or rate is 0
  IF v_commission_rate IS NULL OR v_commission_rate = 0 THEN
    RETURN NEW;
  END IF;

  -- Determine channel
  IF NEW.source = 'salla' THEN
    v_sale_channel := 'salla';
  ELSIF NEW.source = 'online' THEN
    v_sale_channel := 'online';
  ELSE
    v_sale_channel := 'store';
  END IF;

  -- Calculate commission on net total
  v_commission_amount := ROUND(NEW.total * v_commission_rate / 100, 2);

  -- Insert idempotently
  INSERT INTO employee_commissions (
    employee_id,
    sale_id,
    sale_amount,
    commission_rate,
    commission_amount,
    sale_channel,
    status
  ) VALUES (
    v_employee_id,
    NEW.id,
    NEW.total,
    v_commission_rate,
    v_commission_amount,
    v_sale_channel,
    'pending'
  )
  ON CONFLICT (sale_id, employee_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────
-- 5. Void commission when sale is cancelled/returned
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION void_sale_commission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'confirmed' AND NEW.status IN ('cancelled', 'returned') THEN
    UPDATE employee_commissions
    SET
      status     = 'void',
      voided_at  = now(),
      void_reason = 'Sale ' || NEW.status
    WHERE sale_id = NEW.id
    AND status IN ('pending', 'approved');
  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────
-- 6. Attach triggers
-- ─────────────────────────────────────────────
CREATE TRIGGER trigger_calculate_commission_on_sale
  AFTER INSERT OR UPDATE OF status ON sales
  FOR EACH ROW
  EXECUTE FUNCTION calculate_sale_commission();

CREATE TRIGGER trigger_void_commission_on_sale_cancel
  AFTER UPDATE OF status ON sales
  FOR EACH ROW
  EXECUTE FUNCTION void_sale_commission();
