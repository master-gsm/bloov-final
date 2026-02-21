/*
  # Fix Commission Calculation: Use subtotal (before tax)

  ## Change
  - commission_amount now calculated from sales.subtotal (before tax)
  - Previously used sales.total (which includes tax)
  - Formula: commission_amount = ROUND(subtotal * commission_rate / 100, 2)
*/

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

  SELECT commission_rate INTO v_commission_rate
  FROM employees
  WHERE id = v_employee_id;

  IF v_commission_rate IS NULL OR v_commission_rate = 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.source = 'salla' THEN
    v_sale_channel := 'salla';
  ELSIF NEW.source = 'online' THEN
    v_sale_channel := 'online';
  ELSE
    v_sale_channel := 'store';
  END IF;

  v_commission_amount := ROUND(NEW.subtotal * v_commission_rate / 100, 2);

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
    NEW.subtotal,
    v_commission_rate,
    v_commission_amount,
    v_sale_channel,
    'pending'
  )
  ON CONFLICT (sale_id, employee_id) DO NOTHING;

  RETURN NEW;
END;
$$;
