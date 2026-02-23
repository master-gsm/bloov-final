/*
  # BUG-01 + BUG-02 Fix: auto_post_cogs_on_sale

  ## Problems Fixed
  1. BUG-01: Status was inserted as 'posted' (lowercase) — CHECK constraint requires 'Posted' (title case).
     This caused every sale_items INSERT to roll back completely.
  2. BUG-02: GL lines were inserted into `journal_entry_lines` (a wrong/unused table with line_type/amount schema).
     The real GL lines table is `journal_lines` (with debit/credit columns).

  ## Changes
  - `auto_post_cogs_on_sale`: status → 'Posted', lines table → journal_lines with debit/credit columns
  - Also fixes account lookup: uses `accounts` table (not `chart_of_accounts`) with `code` column (not `account_code`)
  - Inventory account uses code '1132' (Finished Goods — the account actually used in purchase GL entries)
  - COGS account uses code '5000' (Cost of Goods Sold in accounts table)
  - All inserts remain atomic within the calling trigger's transaction
*/

CREATE OR REPLACE FUNCTION public.auto_post_cogs_on_sale(
  p_sale_item_id uuid,
  p_product_id   uuid,
  p_branch_id    uuid,
  p_quantity     numeric,
  p_sale_date    date,
  p_created_by   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_avg_cost             NUMERIC;
  v_total_cogs           NUMERIC;
  v_inventory_account_id UUID;
  v_cogs_account_id      UUID;
  v_entry_number         TEXT;
  v_journal_entry_id     UUID;
  v_sale_id              UUID;
  v_actual_created_by    UUID;
BEGIN
  -- IDEMPOTENCY: skip if COGS already posted for this sale item
  IF EXISTS (
    SELECT 1 FROM journal_entries
    WHERE reference_type = 'sale_item'
      AND reference_id   = p_sale_item_id
      AND voided_at IS NULL
  ) THEN
    RETURN;
  END IF;

  -- Resolve created_by
  v_actual_created_by := COALESCE(p_created_by, auth.uid());
  IF v_actual_created_by IS NULL THEN
    RAISE WARNING 'auto_post_cogs_on_sale: No created_by and no auth context. Skipping.';
    RETURN;
  END IF;

  -- Read average cost (lock row to prevent concurrent modification)
  SELECT average_cost INTO v_avg_cost
  FROM product_costing
  WHERE product_id = p_product_id
    AND branch_id  = p_branch_id
  FOR UPDATE;

  IF NOT FOUND OR v_avg_cost IS NULL OR v_avg_cost = 0 THEN
    RETURN;
  END IF;

  v_total_cogs := v_avg_cost * p_quantity;
  IF v_total_cogs <= 0 THEN
    RETURN;
  END IF;

  -- Lookup accounts from the `accounts` table (the real GL table)
  SELECT id INTO v_inventory_account_id
  FROM accounts
  WHERE code = '1132'
    AND is_active = true
  LIMIT 1;

  -- Fallback to 1130 if 1132 not found
  IF v_inventory_account_id IS NULL THEN
    SELECT id INTO v_inventory_account_id
    FROM accounts
    WHERE code = '1130'
      AND is_active = true
    LIMIT 1;
  END IF;

  SELECT id INTO v_cogs_account_id
  FROM accounts
  WHERE code = '5000'
    AND is_active = true
  LIMIT 1;

  IF v_inventory_account_id IS NULL OR v_cogs_account_id IS NULL THEN
    RAISE WARNING 'auto_post_cogs_on_sale: COGS accounts not configured (1132/1130 or 5000 missing). Skipping.';
    RETURN;
  END IF;

  -- Get sale_id for reference
  SELECT sale_id INTO v_sale_id
  FROM sale_items
  WHERE id = p_sale_item_id;

  v_entry_number := 'COGS-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || substr(p_sale_item_id::text, 1, 8);

  -- Create journal entry header with correct 'Posted' status
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
    'Posted',
    p_branch_id,
    'sale_item',
    p_sale_item_id,
    v_actual_created_by,
    v_actual_created_by,
    now()
  ) RETURNING id INTO v_journal_entry_id;

  -- Dr COGS — insert into journal_lines (correct table) with debit/credit columns
  INSERT INTO journal_lines (
    journal_entry_id,
    account_id,
    debit,
    credit,
    description,
    line_number
  ) VALUES (
    v_journal_entry_id,
    v_cogs_account_id,
    v_total_cogs,
    0,
    'Cost of Goods Sold',
    1
  );

  -- Cr Inventory
  INSERT INTO journal_lines (
    journal_entry_id,
    account_id,
    debit,
    credit,
    description,
    line_number
  ) VALUES (
    v_journal_entry_id,
    v_inventory_account_id,
    0,
    v_total_cogs,
    'Inventory Credit',
    2
  );

  RAISE NOTICE 'COGS posted: entry=%, cogs=%, created_by=%', v_entry_number, v_total_cogs, v_actual_created_by;
END;
$$;
