/*
  # Add External Commission Rate to Employees

  ## Summary
  Adds support for two separate commission rates per employee:
  - `commission_rate` (internal): for in-store sales (مبيعات المحل)
  - `commission_rate_external` (external): for external/online sales (مبيعات خارجية)

  ## Changes

  ### 1. employees table
  - Add `commission_rate_external` numeric column, default 0

  ### 2. calculate_sale_commission() trigger function
  - Updated to select the appropriate commission rate based on sale source:
    - source = 'store' → use commission_rate (internal)
    - source = 'salla' OR source = 'external' → use commission_rate_external
    - source = 'online' → use commission_rate_external

  ### Security
  - No RLS changes
  - No role changes
*/

-- ─────────────────────────────────────────────
-- 1. Add commission_rate_external to employees
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'commission_rate_external'
  ) THEN
    ALTER TABLE employees ADD COLUMN commission_rate_external numeric DEFAULT 0;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 2. Update commission trigger to use correct rate by source
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
  v_commission_rate_external numeric;
  v_rate_to_use numeric;
  v_commission_amount numeric;
  v_sale_channel text;
BEGIN
  IF NEW.status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' THEN
    RETURN NEW;
  END IF;

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

  SELECT commission_rate, commission_rate_external
  INTO v_commission_rate, v_commission_rate_external
  FROM employees
  WHERE id = v_employee_id;

  IF NEW.source = 'salla' THEN
    v_sale_channel := 'salla';
    v_rate_to_use := COALESCE(v_commission_rate_external, v_commission_rate, 0);
  ELSIF NEW.source = 'external' OR NEW.source = 'online' THEN
    v_sale_channel := 'external';
    v_rate_to_use := COALESCE(v_commission_rate_external, v_commission_rate, 0);
  ELSE
    v_sale_channel := 'store';
    v_rate_to_use := COALESCE(v_commission_rate, 0);
  END IF;

  IF v_rate_to_use IS NULL OR v_rate_to_use = 0 THEN
    RETURN NEW;
  END IF;

  v_commission_amount := ROUND(NEW.total * v_rate_to_use / 100, 2);

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
    v_rate_to_use,
    v_commission_amount,
    v_sale_channel,
    'pending'
  )
  ON CONFLICT (sale_id, employee_id) DO NOTHING;

  RETURN NEW;
END;
$$;
