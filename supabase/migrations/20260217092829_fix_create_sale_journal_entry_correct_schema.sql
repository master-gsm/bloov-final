/*
  # Fix create_sale_journal_entry Function - Correct Schema

  1. Changes
    - Use correct journal_entry_lines schema:
      - line_type (debit/credit) instead of separate debit/credit columns
      - amount (single value) instead of debit/credit
      - No line_number, base_debit, base_credit columns
    
  2. Correct Account Codes
    - Cash: 1110
    - AR: 1120
    - Sales Revenue: 4100
    - Inventory: 1130
    - COGS: 5100
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

  -- Get accounts from chart_of_accounts
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

  -- Create journal entry
  INSERT INTO journal_entries (
    entry_number,
    date,
    description,
    status,
    branch_id,
    currency_code,
    exchange_rate,
    reference_type,
    reference_id,
    created_by,
    posted_by,
    posted_at
  ) VALUES (
    'SALE-' || TO_CHAR(now(), 'YYYYMMDD-HH24MISS') || '-' || substring(gen_random_uuid()::text, 1, 8),
    COALESCE(v_sale_record.sale_date::DATE, CURRENT_DATE),
    'Sale #' || v_sale_record.sale_number,
    'Posted',
    v_sale_record.branch_id,
    'SAR',
    1.0,
    'sale',
    p_sale_id,
    v_user_id,
    v_user_id,
    now()
  ) RETURNING id INTO v_journal_entry_id;

  -- Dr Cash/AR
  IF v_sale_record.payment_method = 'cash' THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      account_id,
      line_type,
      amount,
      description
    ) VALUES (
      v_journal_entry_id,
      v_cash_account_id,
      'debit',
      ROUND(v_sale_record.total, 2),
      'Cash - Sale #' || v_sale_record.sale_number
    );
  ELSE
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      account_id,
      line_type,
      amount,
      description
    ) VALUES (
      v_journal_entry_id,
      v_ar_account_id,
      'debit',
      ROUND(v_sale_record.total, 2),
      'AR - Sale #' || v_sale_record.sale_number
    );
  END IF;

  -- Cr Revenue
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    line_type,
    amount,
    description
  ) VALUES (
    v_journal_entry_id,
    v_revenue_account_id,
    'credit',
    ROUND(v_sale_record.total, 2),
    'Revenue - Sale #' || v_sale_record.sale_number
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
    -- Dr COGS
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
      ROUND(v_total_cogs, 2),
      'COGS - Sale #' || v_sale_record.sale_number
    );

    -- Cr Inventory
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
      ROUND(v_total_cogs, 2),
      'Inventory - Sale #' || v_sale_record.sale_number
    );
  END IF;

  RETURN v_journal_entry_id;

END;
$function$;
