/*
  # Add VAT Input account and enable VAT Input on purchase journal

  ## Changes

  1. New Account
     - code: 2140 — VAT Recoverable (Input VAT)
     - type: Asset (debit-normal — reduces net VAT payable)
     - Distinct from 2130 (VAT Payable / Output VAT)

  2. Modified Function: create_purchase_receipt_journal_entry
     - If the linked purchase has vat_status_snapshot = 'standard' AND vat_amount > 0:
       * Dr Inventory      = total_value - vat_amount  (net cost, not inflated)
       * Dr VAT Input 2140 = vat_amount
       * Cr AP 2110        = total_value               (full amount owed)
     - If no VAT: logic unchanged (Dr Inventory full, Cr AP full)
     - NO changes to any sale logic.

  3. Updated Function: get_vat_summary
     - VAT Output: from sales (unchanged)
     - VAT Input:  from purchases (unchanged source — already reads vat_amount)
     - Net Payable = Output - Input (unchanged formula)
     Note: function already correctly reads purchases.vat_amount, no change needed there.
*/

-- ─────────────────────────────────────────────
-- 1. Insert VAT Input account if not exists
-- ─────────────────────────────────────────────
INSERT INTO accounts (code, name, name_ar, type, is_active, is_system)
VALUES ('2140', 'VAT Recoverable (Input)', 'ضريبة المدخلات القابلة للاسترداد', 'Asset', true, true)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────
-- 2. Replace create_purchase_receipt_journal_entry
--    Only the lines section is modified; all other logic is identical.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_purchase_receipt_journal_entry(p_receipt_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_receipt_record  purchase_receipts%ROWTYPE;
  v_purchase_record purchases%ROWTYPE;
  v_journal_entry_id UUID;
  v_inventory_account_id UUID;
  v_ap_account_id        UUID;
  v_vat_input_account_id UUID;
  v_line_number INTEGER := 0;
  v_user_id     UUID;
  v_has_vat     BOOLEAN := false;
  v_vat_amount  NUMERIC := 0;
  v_net_cost    NUMERIC := 0;
BEGIN
  v_user_id := COALESCE(auth.uid(), (SELECT created_by FROM purchase_receipts WHERE id = p_receipt_id));

  SELECT * INTO v_receipt_record FROM purchase_receipts WHERE id = p_receipt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase receipt not found: %', p_receipt_id;
  END IF;

  IF v_receipt_record.status != 'received' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_purchase_record FROM purchases WHERE id = v_receipt_record.purchase_id;

  -- Determine VAT
  IF COALESCE(v_purchase_record.vat_status_snapshot, '') = 'standard'
     AND COALESCE(v_purchase_record.vat_amount, 0) > 0 THEN
    v_has_vat    := true;
    v_vat_amount := ROUND(v_purchase_record.vat_amount, 2);
    v_net_cost   := ROUND(v_receipt_record.total_value - v_vat_amount, 2);
  ELSE
    v_net_cost   := ROUND(v_receipt_record.total_value, 2);
  END IF;

  -- Get accounts
  SELECT id INTO v_inventory_account_id FROM accounts WHERE code = '1132';
  SELECT id INTO v_ap_account_id        FROM accounts WHERE code = '2110';
  SELECT id INTO v_vat_input_account_id FROM accounts WHERE code = '2140';

  IF v_inventory_account_id IS NULL OR v_ap_account_id IS NULL THEN
    RAISE EXCEPTION 'Required accounts not found';
  END IF;

  -- Create journal entry
  INSERT INTO journal_entries (
    entry_number, date, description, status, branch_id,
    currency_code, exchange_rate, reference_type, reference_id,
    created_by, posted_by, posted_at
  ) VALUES (
    NULL,
    COALESCE(v_receipt_record.received_date::DATE, CURRENT_DATE),
    'Purchase Receipt #' || v_receipt_record.receipt_number,
    'Draft',
    v_purchase_record.branch_id,
    'SAR',
    1.0,
    'purchase_receipt',
    p_receipt_id,
    v_user_id,
    NULL,
    NULL
  ) RETURNING id INTO v_journal_entry_id;

  -- Dr Inventory (net cost, excluding VAT if applicable)
  v_line_number := v_line_number + 1;
  INSERT INTO journal_lines (
    journal_entry_id, account_id, debit, credit,
    base_debit, base_credit, description, line_number
  ) VALUES (
    v_journal_entry_id, v_inventory_account_id,
    v_net_cost, 0,
    v_net_cost, 0,
    'Inventory - Receipt #' || v_receipt_record.receipt_number,
    v_line_number
  );

  -- Dr VAT Input (only when purchase has standard VAT)
  IF v_has_vat AND v_vat_input_account_id IS NOT NULL THEN
    v_line_number := v_line_number + 1;
    INSERT INTO journal_lines (
      journal_entry_id, account_id, debit, credit,
      base_debit, base_credit, description, line_number
    ) VALUES (
      v_journal_entry_id, v_vat_input_account_id,
      v_vat_amount, 0,
      v_vat_amount, 0,
      'VAT Input - Receipt #' || v_receipt_record.receipt_number,
      v_line_number
    );
  END IF;

  -- Cr Accounts Payable (full invoice amount)
  v_line_number := v_line_number + 1;
  INSERT INTO journal_lines (
    journal_entry_id, account_id, debit, credit,
    base_debit, base_credit, description, line_number
  ) VALUES (
    v_journal_entry_id, v_ap_account_id,
    0, ROUND(v_receipt_record.total_value, 2),
    0, ROUND(v_receipt_record.total_value, 2),
    'Accounts Payable - Receipt #' || v_receipt_record.receipt_number,
    v_line_number
  );

  -- Post the entry
  UPDATE journal_entries
  SET status    = 'Posted',
      posted_by = v_user_id,
      posted_at = now()
  WHERE id = v_journal_entry_id;

  RETURN v_journal_entry_id;
END;
$function$;
