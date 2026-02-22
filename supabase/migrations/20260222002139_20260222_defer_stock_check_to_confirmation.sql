/*
  # Defer Stock Validation to Sale Confirmation

  ## Problem
  - Draft sales fail if product has 0 stock
  - Users can't save incomplete sales while waiting for inventory
  - Sync fails for draft sales with insufficient stock

  ## Solution
  - Allow draft sales to be created with any stock level
  - Check stock ONLY when confirming to 'confirmed' status
  - This allows users to:
    1. Create draft sales offline
    2. Sync drafts when online
    3. Confirm and fix inventory issues later

  ## Changes
  1. Modify process_sale_inventory_out() to skip if status != 'confirmed'
  2. Add check in sale confirmation to validate stock before changing status
  3. Allow INSERT/UPDATE for draft sales without stock validation
*/

-- Modify trigger to only process confirmed sales
CREATE OR REPLACE FUNCTION process_sale_inventory_out()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_id UUID;
  v_product_id UUID;
  v_sale_qty NUMERIC;
  v_available_qty NUMERIC;
  v_product_sku TEXT;
  v_sale_date DATE;
  v_created_by UUID;
  v_sale_item_id UUID;
BEGIN
  -- Only process confirmed sales
  IF NEW.status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Skip if atomic function already handled this (flag set in session)
  IF current_setting('app.atomic_sale_in_progress', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Skip if voided or deleted
  IF NEW.voided_at IS NOT NULL OR NEW.is_deleted = true THEN
    RETURN NEW;
  END IF;

  SELECT branch_id, sale_date, created_by
  INTO v_branch_id, v_sale_date, v_created_by
  FROM sales
  WHERE id = NEW.sale_id;

  v_product_id := NEW.product_id;
  v_sale_qty := NEW.quantity;
  v_sale_item_id := NEW.id;

  SELECT sku INTO v_product_sku
  FROM products
  WHERE id = v_product_id;

  SELECT quantity_on_hand INTO v_available_qty
  FROM product_costing
  WHERE product_id = v_product_id
  AND branch_id = v_branch_id;

  IF NOT FOUND THEN
    v_available_qty := 0;
  END IF;

  IF v_available_qty < v_sale_qty THEN
    RAISE EXCEPTION 'Insufficient stock for item [%]: Available=%, Requested=%',
      v_product_sku,
      v_available_qty,
      v_sale_qty;
  END IF;

  UPDATE product_costing
  SET quantity_on_hand = quantity_on_hand - v_sale_qty,
      updated_at = now()
  WHERE product_id = v_product_id
  AND branch_id = v_branch_id;

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
$$;

COMMENT ON FUNCTION process_sale_inventory_out() IS
'Deduct from inventory and post COGS when sale is CONFIRMED (not draft)';
