/*
  # Moving Average Costing & COGS Auto-Post System

  ## Overview
  Implements automatic Cost of Goods Sold (COGS) posting using Moving Average costing method.
  Posts journal entries automatically on every successful sale.

  ## 1. Core Principles
  
  - **Moving Average Cost**: avg_cost updates only on purchases (IN)
  - **COGS Auto-Post**: Posts journal entry automatically on sale (OUT)
  - **Transactional Integrity**: All operations in single transaction
  - **Idempotency**: Prevents duplicate COGS entries for same sale
  - **Locking**: Uses SELECT FOR UPDATE to prevent race conditions

  ## 2. Accounts Used
  
  - **1130 - Inventory** (Asset)
  - **5100 - Cost of Goods Sold** (Expense)

  ## 3. Journal Entry Structure
  
  When a sale occurs:
  ```
  Dr  5100 - Cost of Goods Sold     [total_cogs]
  Cr  1130 - Inventory               [total_cogs]
  ```
  
  Where: total_cogs = avg_cost × quantity_sold

  ## 4. Process Flow
  
  1. Sale created → sale_items inserted
  2. Trigger fires: process_sale_inventory_out()
  3. Read avg_cost with SELECT FOR UPDATE (lock row)
  4. Calculate total_cogs
  5. Deduct inventory quantity
  6. Create inventory movement (OUT)
  7. Post COGS journal entry (Dr COGS, Cr Inventory)
  8. Commit transaction

  ## 5. Idempotency Check
  
  Before creating journal entry, check:
  ```
  IF EXISTS journal_entry WHERE reference_type = 'sale_item' 
    AND reference_id = sale_item_id THEN SKIP
  ```

  ## 6. Security & Performance
  
  - SECURITY DEFINER with strict search_path
  - Row-level locking prevents concurrent issues
  - Indexed foreign keys for fast lookups
  - Optimized for high-volume sales
*/

-- ═══════════════════════════════════════════════════════════
-- 1. CREATE COGS AUTO-POST FUNCTION
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION auto_post_cogs_on_sale(
  p_sale_item_id UUID,
  p_product_id UUID,
  p_branch_id UUID,
  p_quantity NUMERIC,
  p_sale_date DATE,
  p_created_by UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_avg_cost NUMERIC;
  v_total_cogs NUMERIC;
  v_inventory_account_id UUID;
  v_cogs_account_id UUID;
  v_entry_number TEXT;
  v_journal_entry_id UUID;
  v_sale_id UUID;
BEGIN
  -- ═══════════════════════════════════════════════════════════
  -- IDEMPOTENCY CHECK - Prevent duplicate COGS entries
  -- ═══════════════════════════════════════════════════════════
  
  IF EXISTS (
    SELECT 1 FROM journal_entries
    WHERE reference_type = 'sale_item'
      AND reference_id = p_sale_item_id
      AND voided_at IS NULL
  ) THEN
    -- COGS already posted for this sale item, skip
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════
  -- READ AVERAGE COST WITH LOCK (SELECT FOR UPDATE)
  -- ═══════════════════════════════════════════════════════════
  
  SELECT average_cost INTO v_avg_cost
  FROM product_costing
  WHERE product_id = p_product_id
    AND branch_id = p_branch_id
  FOR UPDATE;  -- Lock this row to prevent race conditions

  -- If no costing record or cost is zero, skip COGS posting
  IF NOT FOUND OR v_avg_cost IS NULL OR v_avg_cost = 0 THEN
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════
  -- CALCULATE TOTAL COGS
  -- ═══════════════════════════════════════════════════════════
  
  v_total_cogs := v_avg_cost * p_quantity;

  -- Skip if COGS is zero or negative
  IF v_total_cogs <= 0 THEN
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════
  -- GET ACCOUNT IDs (1130 - Inventory, 5100 - COGS)
  -- ═══════════════════════════════════════════════════════════
  
  SELECT id INTO v_inventory_account_id
  FROM chart_of_accounts
  WHERE account_code = '1130'
    AND is_active = true
  LIMIT 1;

  SELECT id INTO v_cogs_account_id
  FROM chart_of_accounts
  WHERE account_code = '5100'
    AND is_active = true
  LIMIT 1;

  -- If accounts not found, cannot post COGS
  IF v_inventory_account_id IS NULL OR v_cogs_account_id IS NULL THEN
    RAISE WARNING 'COGS accounts not configured (1130 or 5100 missing)';
    RETURN;
  END IF;

  -- Get sale_id for reference
  SELECT sale_id INTO v_sale_id
  FROM sale_items
  WHERE id = p_sale_item_id;

  -- ═══════════════════════════════════════════════════════════
  -- GENERATE ENTRY NUMBER
  -- ═══════════════════════════════════════════════════════════
  
  v_entry_number := 'COGS-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || substr(p_sale_item_id::text, 1, 8);

  -- ═══════════════════════════════════════════════════════════
  -- CREATE JOURNAL ENTRY HEADER
  -- ═══════════════════════════════════════════════════════════
  
  INSERT INTO journal_entries (
    entry_number,
    date,
    description,
    status,
    branch_id,
    reference_type,
    reference_id,
    created_by,
    posted_by,
    posted_at
  ) VALUES (
    v_entry_number,
    p_sale_date,
    'COGS Auto-Post for Sale',
    'posted',
    p_branch_id,
    'sale_item',
    p_sale_item_id,
    p_created_by,
    p_created_by,
    now()
  ) RETURNING id INTO v_journal_entry_id;

  -- ═══════════════════════════════════════════════════════════
  -- CREATE JOURNAL ENTRY LINES
  -- ═══════════════════════════════════════════════════════════
  
  -- Dr COGS (Debit)
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    line_type,
    amount,
    description
  ) VALUES (
    v_journal_entry_id,
    v_cogs_account_id,
    'debit',
    v_total_cogs,
    'Cost of Goods Sold'
  );

  -- Cr Inventory (Credit)
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    line_type,
    amount,
    description
  ) VALUES (
    v_journal_entry_id,
    v_inventory_account_id,
    'credit',
    v_total_cogs,
    'Inventory reduction'
  );

END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 2. UPDATE process_sale_inventory_out TO INCLUDE COGS POSTING
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
  v_sale_date DATE;
  v_created_by UUID;
BEGIN
  -- Only process if not voided or deleted
  IF NEW.voided_at IS NOT NULL OR NEW.is_deleted = true THEN
    RETURN NEW;
  END IF;

  -- Get sale details
  SELECT branch_id, sale_date, created_by 
  INTO v_branch_id, v_sale_date, v_created_by
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
    v_created_by
  );

  -- ═══════════════════════════════════════════════════════════
  -- AUTO-POST COGS JOURNAL ENTRY
  -- ═══════════════════════════════════════════════════════════
  
  PERFORM auto_post_cogs_on_sale(
    NEW.id,              -- sale_item_id
    v_product_id,        -- product_id
    v_branch_id,         -- branch_id
    v_sale_qty,          -- quantity
    v_sale_date,         -- sale_date
    v_created_by         -- created_by
  );

  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 3. ADD COMMENTS FOR DOCUMENTATION
-- ═══════════════════════════════════════════════════════════

COMMENT ON FUNCTION auto_post_cogs_on_sale IS 
'Automatically posts COGS journal entry on sale using moving average cost.
Uses SELECT FOR UPDATE to lock costing record and prevent race conditions.
Includes idempotency check to prevent duplicate COGS entries.
Posts: Dr COGS (5100), Cr Inventory (1130).';

COMMENT ON FUNCTION process_sale_inventory_out IS 
'Processes inventory OUT movement on sales.
1. Validates stock availability (prevents negative inventory)
2. Deducts quantity from product_costing
3. Creates inventory_movements audit record
4. Auto-posts COGS journal entry
All operations execute in single transaction for data integrity.';
