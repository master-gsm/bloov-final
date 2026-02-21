/*
  # Fix: Reverse cash movements when sales are marked as returned

  ## Summary
  When a cash sale is marked as returned, the corresponding cash transaction should be reversed
  (deleted from the register). Currently, the trigger only records movements when sales are confirmed
  but doesn't remove them when returned. This fix updates the trigger to handle returned status.

  ## Changes
  - Update `record_sale_cash_movement()` function to delete register transactions when sales are marked as returned
  - Ensures proper cash register balance when returns occur
*/

CREATE OR REPLACE FUNCTION public.record_sale_cash_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_register_id uuid;
BEGIN
  -- Handle returned status: remove the cash movement
  IF NEW.status = 'returned' THEN
    DELETE FROM register_transactions
    WHERE reference_id = NEW.id
      AND reference_type = 'sales'
      AND transaction_type = 'sale';
    RETURN NEW;
  END IF;

  -- Only for cash sales becoming confirmed
  IF NEW.status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_method NOT IN ('cash') THEN
    RETURN NEW;
  END IF;

  -- On update, only if status just changed to confirmed
  IF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Find open register
  SELECT id INTO v_register_id
  FROM cash_registers
  WHERE status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  IF v_register_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Insert movement (idempotent via unique index on reference_id for sales)
  INSERT INTO register_transactions (
    register_id,
    transaction_type,
    amount,
    reference_id,
    reference_type,
    description,
    description_ar,
    created_by
  ) VALUES (
    v_register_id,
    'sale',
    NEW.total,
    NEW.id,
    'sales',
    'Cash sale #' || COALESCE(NEW.sale_number, NEW.id::text),
    'بيع نقدي #' || COALESCE(NEW.sale_number, NEW.id::text),
    NEW.created_by
  )
  ON CONFLICT (reference_id) WHERE reference_type = 'sales' DO NOTHING;

  RETURN NEW;
END;
$function$;
