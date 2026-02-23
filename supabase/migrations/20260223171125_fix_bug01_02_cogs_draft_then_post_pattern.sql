/*
  # BUG-01+02 (Second Pass): auto_post_cogs_on_sale — Draft-then-Post Pattern

  ## Problem Discovered in Validation
  The previous fix set status='Posted' on journal entry creation, but the guard trigger
  `trg_protect_posted_lines` (function: protect_posted_entry_lines) blocks ALL inserts
  into journal_lines when the parent journal_entry has status 'Posted' or 'Void'.

  This is the correct security behavior — it prevents tampering with posted entries.
  The fix must work WITH this guard, not around it.

  ## Solution: Draft → Insert Lines → Update to Posted
  1. Create journal_entries with status = 'Draft'
  2. Insert journal_lines (guard allows this — entry is Draft)
  3. UPDATE journal_entries SET status = 'Posted' (no lines involved, guard not triggered)

  This is the same pattern used by process_purchase_receipt_atomic and other working functions.
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

  -- Lookup accounts from `accounts` table (the real GL table, not chart_of_accounts)
  SELECT id INTO v_inventory_account_id
  FROM accounts
  WHERE code = '1132' AND is_active = true
  LIMIT 1;

  IF v_inventory_account_id IS NULL THEN
    SELECT id INTO v_inventory_account_id
    FROM accounts
    WHERE code = '1130' AND is_active = true
    LIMIT 1;
  END IF;

  SELECT id INTO v_cogs_account_id
  FROM accounts
  WHERE code = '5000' AND is_active = true
  LIMIT 1;

  IF v_inventory_account_id IS NULL OR v_cogs_account_id IS NULL THEN
    RAISE WARNING 'auto_post_cogs_on_sale: COGS accounts not configured (1132/1130 or 5000 missing). Skipping.';
    RETURN;
  END IF;

  v_entry_number := 'COGS-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || substr(p_sale_item_id::text, 1, 8);

  -- Step 1: Create journal entry as DRAFT (so guard trigger allows line inserts)
  INSERT INTO journal_entries (
    entry_number, date, description, status,
    branch_id, reference_type, reference_id,
    created_by, posted_by, posted_at
  ) VALUES (
    v_entry_number, p_sale_date, 'COGS Auto-Post for Sale', 'Draft',
    p_branch_id, 'sale_item', p_sale_item_id,
    v_actual_created_by, v_actual_created_by, now()
  ) RETURNING id INTO v_journal_entry_id;

  -- Step 2: Insert journal_lines (guard allows inserts on Draft entries)
  INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, line_number)
  VALUES (v_journal_entry_id, v_cogs_account_id, v_total_cogs, 0, 'Cost of Goods Sold', 1);

  INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, line_number)
  VALUES (v_journal_entry_id, v_inventory_account_id, 0, v_total_cogs, 'Inventory Credit', 2);

  -- Step 3: Mark as Posted (no line modification — guard not triggered)
  UPDATE journal_entries
  SET status = 'Posted'
  WHERE id = v_journal_entry_id;

  RAISE NOTICE 'COGS posted: entry=%, cogs=%, sale_item=%', v_entry_number, v_total_cogs, p_sale_item_id;
END;
$$;
