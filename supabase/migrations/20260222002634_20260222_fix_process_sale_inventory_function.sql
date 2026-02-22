/*
  # Fix process_sale_inventory_out Function

  ## Problem
  - Trigger was trying to check NEW.status on sale_items table (which has no status field)
  - Trigger should check sales.status instead

  ## Solution
  - Revert to original trigger function that checks sales.status via JOIN
  - Only process inventory when sale is confirmed
  - Remove references to non-existent fields on sale_items

  ## Changes
  1. Fix process_sale_inventory_out() to fetch sale status from sales table
  2. Only process confirmed sales (not draft)
  3. Skip voided or deleted sales
*/

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
  v_sale_status TEXT;
  v_sale_date DATE;
  v_created_by UUID;
  v_sale_item_id UUID;
BEGIN
  -- Get sale details including status
  SELECT s.branch_id, s.status, s.sale_date, s.created_by
  INTO v_branch_id, v_sale_status, v_sale_date, v_created_by
  FROM sales s
  WHERE s.id = NEW.sale_id;

  -- Only process confirmed sales (not draft)
  IF v_sale_status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Skip if atomic function already handled this (flag set in session)
  IF current_setting('app.atomic_sale_in_progress', true) = 'true' THEN
    RETURN NEW;
  END IF;

  v_product_id := NEW.product_id;
  v_sale_qty := NEW.quantity;
  v_sale_item_id := NEW.id;

  -- Get product details for error message
  SELECT sku INTO v_product_sku
  FROM products
  WHERE id = v_product_id;

  -- Get available stock
  SELECT quantity_on_hand INTO v_available_qty
  FROM product_costing
  WHERE product_id = v_product_id
    AND branch_id = v_branch_id;

  -- If no costing record exists, stock is 0
  IF NOT FOUND THEN
    v_available_qty := 0;
  END IF;

  -- CRITICAL CHECK: Prevent overselling
  IF v_available_qty < v_sale_qty THEN
    RAISE EXCEPTION 'Insufficient stock for item [%]: Available=%, Requested=%',
      v_product_sku,
      v_available_qty,
      v_sale_qty;
  END IF;

  -- INVENTORY DEDUCTION
  UPDATE product_costing
  SET quantity_on_hand = quantity_on_hand - v_sale_qty,
      updated_at = now()
  WHERE product_id = v_product_id
    AND branch_id = v_branch_id;

  -- CREATE INVENTORY MOVEMENT RECORD (AUDIT TRAIL)
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

  -- POST COGS
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
'Validates stock and processes inventory when sale is CONFIRMED (not draft). Fetches sale status from sales table.';
