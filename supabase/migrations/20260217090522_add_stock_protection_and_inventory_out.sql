/*
  # Stock Protection and Inventory OUT Movement

  ## Overview
  Implements strict inventory protection to prevent negative stock.
  Handles inventory deduction on sales with validation.

  ## 1. Key Features
  
  - **Stock Validation**: Prevents selling more than available quantity
  - **Inventory OUT Movement**: Creates movement records for sales
  - **Automatic Deduction**: Reduces quantity_on_hand on sale
  - **Cost Preservation**: Does NOT modify average_cost on sales (only purchases change it)
  - **Error Handling**: Clear exceptions when stock is insufficient

  ## 2. Trigger Function: process_sale_inventory_out()
  
  ### Responsibilities:
  - Check if sufficient stock exists before sale
  - Raise exception if quantity_on_hand < quantity_sold
  - Deduct quantity from product_costing
  - Create inventory_movements record (type: OUT)
  - Preserve average_cost (no changes on sales)

  ### Validation Logic:
  ```
  IF quantity_on_hand < sale_quantity THEN
    RAISE EXCEPTION 'Insufficient stock for item [SKU]: Available=%, Requested=%'
  END IF;
  ```

  ### Deduction Logic:
  ```
  UPDATE product_costing
  SET quantity_on_hand = quantity_on_hand - sale_quantity
  WHERE product_id = sale_product_id AND branch_id = sale_branch_id;
  ```

  ## 3. Integration Points
  
  - Triggered AFTER INSERT on sale_items
  - Creates inventory_movements for audit trail
  - Does NOT affect average_cost
  - Blocks transaction if validation fails

  ## 4. Security
  
  - Function runs as SECURITY DEFINER
  - Strict search_path set
  - Clear error messages for debugging
*/

-- ═══════════════════════════════════════════════════════════
-- 1. CREATE INVENTORY OUT TRIGGER FUNCTION
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION process_sale_inventory_out()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_branch_id UUID;
  v_product_id UUID;
  v_sale_qty NUMERIC;
  v_available_qty NUMERIC;
  v_product_sku TEXT;
  v_product_name TEXT;
BEGIN
  -- Only process if not voided or deleted
  IF NEW.voided_at IS NOT NULL OR NEW.is_deleted = true THEN
    RETURN NEW;
  END IF;

  -- Get sale details
  SELECT branch_id INTO v_branch_id
  FROM sales
  WHERE id = NEW.sale_id;

  v_product_id := NEW.product_id;
  v_sale_qty := NEW.quantity;

  -- Get product details for error message
  SELECT sku, name INTO v_product_sku, v_product_name
  FROM products
  WHERE id = v_product_id;

  -- ═══════════════════════════════════════════════════════════
  -- STOCK VALIDATION - PREVENT NEGATIVE INVENTORY
  -- ═══════════════════════════════════════════════════════════
  
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

  -- ═══════════════════════════════════════════════════════════
  -- INVENTORY DEDUCTION
  -- ═══════════════════════════════════════════════════════════
  
  UPDATE product_costing
  SET quantity_on_hand = quantity_on_hand - v_sale_qty,
      updated_at = now()
  WHERE product_id = v_product_id
    AND branch_id = v_branch_id;

  -- ═══════════════════════════════════════════════════════════
  -- CREATE INVENTORY MOVEMENT RECORD (AUDIT TRAIL)
  -- ═══════════════════════════════════════════════════════════
  
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
    (SELECT created_by FROM sales WHERE id = NEW.sale_id)
  );

  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 2. CREATE TRIGGER ON sale_items
-- ═══════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trigger_process_sale_inventory_out ON sale_items;

CREATE TRIGGER trigger_process_sale_inventory_out
  AFTER INSERT
  ON sale_items
  FOR EACH ROW
  EXECUTE FUNCTION process_sale_inventory_out();

-- ═══════════════════════════════════════════════════════════
-- 3. ADD COMMENT FOR DOCUMENTATION
-- ═══════════════════════════════════════════════════════════

COMMENT ON FUNCTION process_sale_inventory_out() IS 
'Validates stock availability and processes inventory OUT movement on sales. 
Prevents negative inventory by raising exception if insufficient stock exists.
Creates audit trail in inventory_movements table.
Does NOT modify average_cost (cost changes only on purchases).';
