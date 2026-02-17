/*
  # Fix create_sale_journal_entry Function

  1. Changes
    - Replace 'accounts' table with 'chart_of_accounts'
    - Replace 'journal_lines' table with 'journal_entry_lines'
    - Fix account codes:
      - Cash: 1110 (was 1111)
      - AR: 1120 (was 1121)
      - Sales Revenue: 4100 (was 4110)
      - Inventory: 1130 (was 1132)
      - COGS: 5100 (correct)
    
  2. Security
    - Maintains SECURITY DEFINER with search_path protection
*/

CREATE OR REPLACE FUNCTION public.create_sale_journal_entry(p_sale_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sale_record sales%ROWTYPE;
  v_journal_entry_id UUID;
  v_cash_account_id UUID;
  v_ar_account_id UUID;
  v_revenue_account_id UUID;
  v_cogs_account_id UUID;
  v_inventory_account_id UUID;
  v_line_number INTEGER := 0;
  v_total_cogs NUMERIC(15, 2) := 0;
  v_user_id UUID;
BEGIN
  v_user_id := COALESCE(auth.uid(), (SELECT created_by FROM sales WHERE id = p_sale_id));

  SELECT * INTO v_sale_record FROM sales WHERE id = p_sale_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found: %', p_sale_id;
  END IF;

  IF v_sale_record.status != 'confirmed' THEN
    RETURN NULL;
  END IF;

  -- Get accounts from chart_of_accounts (FIXED)
  SELECT id INTO v_cash_account_id FROM chart_of_accounts WHERE account_code = '1110';
  SELECT id INTO v_ar_account_id FROM chart_of_accounts WHERE account_code = '1120';
  SELECT id INTO v_revenue_account_id FROM chart_of_accounts WHERE account_code = '4100';
  SELECT id INTO v_cogs_account_id FROM chart_of_accounts WHERE account_code = '5100';
  SELECT id INTO v_inventory_account_id FROM chart_of_accounts WHERE account_code = '1130';

  IF v_cash_account_id IS NULL OR v_ar_account_id IS NULL OR 
     v_revenue_account_id IS NULL OR v_cogs_account_id IS NULL OR 
     v_inventory_account_id IS NULL THEN
    RAISE EXCEPTION 'Required accounts not found';
  END IF;

  -- Create journal entry (will fail with unique_violation if duplicate)
  INSERT INTO journal_entries (
    entry_number, date, description, status, branch_id,
    currency_code, exchange_rate, reference_type, reference_id,
    created_by, posted_by, posted_at
  ) VALUES (
    NULL,
    COALESCE(v_sale_record.sale_date::DATE, CURRENT_DATE),
    'Sale #' || v_sale_record.sale_number,
    'Draft',
    v_sale_record.branch_id,
    'SAR',
    1.0,
    'sale',
    p_sale_id,
    v_user_id,
    NULL,
    NULL
  ) RETURNING id INTO v_journal_entry_id;

  -- Dr Cash/AR
  v_line_number := v_line_number + 1;
  IF v_sale_record.payment_method = 'cash' THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, debit, credit, 
      base_debit, base_credit, description, line_number
    ) VALUES (
      v_journal_entry_id, v_cash_account_id,
      ROUND(v_sale_record.total, 2), 0,
      ROUND(v_sale_record.total, 2), 0,
      'Cash - Sale #' || v_sale_record.sale_number,
      v_line_number
    );
  ELSE
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, debit, credit,
      base_debit, base_credit, description, line_number
    ) VALUES (
      v_journal_entry_id, v_ar_account_id,
      ROUND(v_sale_record.total, 2), 0,
      ROUND(v_sale_record.total, 2), 0,
      'AR - Sale #' || v_sale_record.sale_number,
      v_line_number
    );
  END IF;

  -- Cr Revenue (FIXED)
  v_line_number := v_line_number + 1;
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, debit, credit,
    base_debit, base_credit, description, line_number
  ) VALUES (
    v_journal_entry_id, v_revenue_account_id,
    0, ROUND(v_sale_record.total, 2),
    0, ROUND(v_sale_record.total, 2),
    'Revenue - Sale #' || v_sale_record.sale_number,
    v_line_number
  );

  -- Calculate COGS
  SELECT COALESCE(SUM(si.quantity * COALESCE(p.purchase_price, 0)), 0)
  INTO v_total_cogs
  FROM sale_items si
  JOIN products p ON si.product_id = p.id
  WHERE si.sale_id = p_sale_id
  AND p.type = 'stockable';

  -- Add COGS entries if applicable
  IF v_total_cogs > 0 THEN
    v_line_number := v_line_number + 1;
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, debit, credit,
      base_debit, base_credit, description, line_number
    ) VALUES (
      v_journal_entry_id, v_cogs_account_id,
      ROUND(v_total_cogs, 2), 0,
      ROUND(v_total_cogs, 2), 0,
      'COGS - Sale #' || v_sale_record.sale_number,
      v_line_number
    );

    v_line_number := v_line_number + 1;
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, debit, credit,
      base_debit, base_credit, description, line_number
    ) VALUES (
      v_journal_entry_id, v_inventory_account_id,
      0, ROUND(v_total_cogs, 2),
      0, ROUND(v_total_cogs, 2),
      'Inventory - Sale #' || v_sale_record.sale_number,
      v_line_number
    );
  END IF;

  -- Post the entry
  UPDATE journal_entries 
  SET status = 'Posted', 
      posted_by = v_user_id,
      posted_at = now()
  WHERE id = v_journal_entry_id;

  RETURN v_journal_entry_id;

END;
$function$;
