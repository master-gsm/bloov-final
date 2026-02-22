/*
  # Fix created_by NULL in Journal Entries

  ## Problem
  When sales are inserted without created_by, journal entries fail with:
  "null value in column "created_by" of relation "journal_entries" violates not-null constraint"

  ## Solution
  1. Add DEFAULT CURRENT_USER_ID to sales.created_by
  2. Add safety check in auto_post_cogs_on_sale() to use auth.uid() if created_by is null
  3. Update trigger to handle null created_by from sales table

  ## Security
  - Uses SECURITY DEFINER to safely set created_by
  - Falls back to auth.uid() when data is missing
*/

-- Add default to sales.created_by if column exists and doesn't have default
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE sales
    ALTER COLUMN created_by SET DEFAULT auth.uid();
  END IF;
END $$;

-- Update auto_post_cogs_on_sale to handle null created_by
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
  v_actual_created_by UUID;
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
  -- Determine actual created_by (fallback to current user if null)
  -- ═══════════════════════════════════════════════════════════
  
  v_actual_created_by := COALESCE(p_created_by, auth.uid());
  
  IF v_actual_created_by IS NULL THEN
    RAISE WARNING 'auto_post_cogs_on_sale: No created_by provided and no auth context. Skipping COGS.';
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════
  -- READ AVERAGE COST WITH LOCK (SELECT FOR UPDATE)
  -- ═══════════════════════════════════════════════════════════
  
  SELECT average_cost INTO v_avg_cost
  FROM product_costing
  WHERE product_id = p_product_id
    AND branch_id = p_branch_id
  FOR UPDATE;

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
    v_actual_created_by,
    v_actual_created_by,
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
    'Inventory Credit'
  );

  RAISE NOTICE 'COGS posted: entry=%, amount=%, created_by=%', v_entry_number, v_total_cogs, v_actual_created_by;
END $$;
