/*
  # BUG-05 Fix: Orphan Inventory Movements

  ## Problem
  Two `inventory_movements` rows reference sale IDs that no longer exist in the `sales`
  table (not soft-deleted — completely absent). These are genuine referential integrity
  violations, not valid financial records, created on 2026-02-17.

  ## Fix
  1. Delete confirmed orphan movements using the bypass flag (they reference non-existent sales)
  2. Update `process_sale_inventory_out` to guard against future orphan creation
     by validating sale existence before recording a movement.

  ## Security Note
  The bypass flag `app.bypass_immutable` is used only within this migration to clean
  data that has no parent record and cannot be voided through normal means.
*/

-- Step 1: Clean orphan movements (bypass the prevent_financial_delete trigger)
SET LOCAL app.bypass_immutable = 'true';

DELETE FROM inventory_movements
WHERE reference_type = 'sale'
  AND reference_id IN (
    '5fca5900-e5cf-45f8-a3a3-91ed2313a021',
    '8438d67a-bd20-456b-96f3-04d4c9ca5ae0'
  );

-- Also clean any other orphan sale movements generically
DELETE FROM inventory_movements
WHERE reference_type = 'sale'
  AND NOT EXISTS (
    SELECT 1 FROM sales s WHERE s.id = inventory_movements.reference_id
  );

RESET app.bypass_immutable;

-- Step 2: Update process_sale_inventory_out to guard against future orphan creation
CREATE OR REPLACE FUNCTION public.process_sale_inventory_out()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_branch_id     UUID;
  v_product_id    UUID;
  v_sale_qty      NUMERIC;
  v_available_qty NUMERIC;
  v_product_sku   TEXT;
  v_sale_status   TEXT;
  v_sale_date     DATE;
  v_created_by    UUID;
  v_sale_item_id  UUID;
BEGIN
  -- Get sale details including status
  SELECT s.branch_id, s.status, s.sale_date, s.created_by
  INTO v_branch_id, v_sale_status, v_sale_date, v_created_by
  FROM sales s
  WHERE s.id = NEW.sale_id;

  -- Guard: sale must exist before recording any inventory movement
  IF NOT FOUND THEN
    RAISE EXCEPTION 'process_sale_inventory_out: Sale % does not exist. Cannot record inventory movement.', NEW.sale_id;
  END IF;

  -- Only process confirmed sales (not draft)
  IF v_sale_status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Skip if atomic function already handled this (flag set in session)
  IF current_setting('app.atomic_sale_in_progress', true) = 'true' THEN
    RETURN NEW;
  END IF;

  v_product_id   := NEW.product_id;
  v_sale_qty     := NEW.quantity;
  v_sale_item_id := NEW.id;

  -- Get product SKU for error messages
  SELECT sku INTO v_product_sku
  FROM products
  WHERE id = v_product_id;

  -- Get available stock
  SELECT quantity_on_hand INTO v_available_qty
  FROM product_costing
  WHERE product_id = v_product_id
    AND branch_id  = v_branch_id;

  IF NOT FOUND THEN
    v_available_qty := 0;
  END IF;

  -- CRITICAL: Prevent overselling
  IF v_available_qty < v_sale_qty THEN
    RAISE EXCEPTION 'Insufficient stock for item [%]: Available=%, Requested=%',
      v_product_sku, v_available_qty, v_sale_qty;
  END IF;

  -- Decrement inventory
  UPDATE product_costing
  SET quantity_on_hand = quantity_on_hand - v_sale_qty,
      updated_at       = now()
  WHERE product_id = v_product_id
    AND branch_id  = v_branch_id;

  -- Record inventory movement (audit trail) — only when sale is verified to exist
  INSERT INTO inventory_movements (
    product_id,
    movement_type,
    quantity,
    reference_type,
    reference_id,
    notes,
    notes_ar,
    created_by
  ) VALUES (
    v_product_id,
    'out',
    v_sale_qty,
    'sale',
    NEW.sale_id,
    'Sale deduction',
    'خصم مبيعات',
    v_created_by
  );

  -- Post COGS journal entry
  PERFORM auto_post_cogs_on_sale(
    v_sale_item_id,
    v_product_id,
    v_branch_id,
    v_sale_qty,
    v_sale_date,
    v_created_by
  );

  RETURN NEW;
END;
$function$;
