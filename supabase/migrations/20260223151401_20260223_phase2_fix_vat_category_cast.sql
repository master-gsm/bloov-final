/*
  # Fix post_partner_operation_atomic: cast vat_category text → vat_category_enum
*/

CREATE OR REPLACE FUNCTION public.post_partner_operation_atomic(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_expense_id     uuid;
  v_partner_id     uuid;
  v_op_type        text;
  v_amount         numeric;
  v_vat_amount     numeric := 0;
  v_net_amount     numeric;
  v_total_amount   numeric;
  v_vat_category   text;
  v_has_vat        boolean := false;
  v_expense_date   date;
  v_description    text;
  v_branch_id      uuid;
  v_user_id        uuid;
  v_payment_method text;

  v_dr_account_id  uuid;
  v_cr_account_id  uuid;
  v_vat_account_id uuid;

  v_je_id          uuid;
  v_je_number      text;
  v_line_no        int := 0;

  v_expense        setup_expenses%ROWTYPE;
BEGIN
  PERFORM set_config('app.bypass_immutable', 'true', true);

  v_expense_id     := NULLIF(p_payload->>'expense_id', '')::uuid;
  v_partner_id     := NULLIF(p_payload->>'partner_id', '')::uuid;
  v_op_type        := COALESCE(p_payload->>'operation_type', 'operational');
  v_amount         := COALESCE((p_payload->>'amount')::numeric, 0);
  v_vat_amount     := COALESCE((p_payload->>'vat_amount')::numeric, 0);
  v_vat_category   := COALESCE(p_payload->>'vat_category', 'standard');
  v_expense_date   := COALESCE((p_payload->>'expense_date')::date, CURRENT_DATE);
  v_description    := COALESCE(p_payload->>'description', 'Partner Operation');
  v_payment_method := COALESCE(p_payload->>'payment_method', 'cash');
  v_user_id        := COALESCE(auth.uid(), NULLIF(p_payload->>'created_by','')::uuid);

  IF v_expense_id IS NOT NULL THEN
    SELECT * INTO v_expense FROM setup_expenses WHERE id = v_expense_id;
    IF FOUND THEN v_branch_id := v_expense.branch_id; END IF;
  END IF;

  IF v_branch_id IS NULL THEN
    v_branch_id := NULLIF(p_payload->>'branch_id', '')::uuid;
  END IF;
  IF v_branch_id IS NULL THEN
    SELECT branch_id INTO v_branch_id FROM users WHERE id = v_user_id LIMIT 1;
  END IF;
  IF v_branch_id IS NULL THEN
    SELECT id INTO v_branch_id FROM branches LIMIT 1;
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;

  -- Idempotency
  IF v_expense_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM journal_entries
    WHERE reference_type = 'setup_expense'
      AND reference_id = v_expense_id
      AND status IN ('Draft','Posted')
  ) THEN
    PERFORM set_config('app.bypass_immutable', 'false', true);
    RETURN jsonb_build_object('success', true, 'duplicate', true,
      'message', 'GL entry already exists for this expense');
  END IF;

  -- Period lock
  IF EXISTS (
    SELECT 1 FROM accounting_periods
    WHERE is_closed = true
      AND start_date <= v_expense_date
      AND end_date   >= v_expense_date
  ) THEN
    PERFORM set_config('app.bypass_immutable', 'false', true);
    RAISE EXCEPTION 'Accounting period is locked for date %', v_expense_date;
  END IF;

  -- VAT
  v_has_vat      := v_vat_category = 'standard' AND v_vat_amount > 0;
  v_vat_amount   := CASE WHEN v_has_vat THEN ROUND(v_vat_amount, 2) ELSE 0 END;
  v_total_amount := ROUND(v_amount, 2);
  v_net_amount   := ROUND(v_total_amount - v_vat_amount, 2);

  SELECT id INTO v_vat_account_id FROM accounts WHERE code = '2140' LIMIT 1;

  -- Route by type
  IF v_op_type = 'capital' OR v_op_type = 'cash' THEN
    SELECT id INTO v_dr_account_id FROM accounts WHERE code = '1110' LIMIT 1;
    SELECT id INTO v_cr_account_id FROM accounts WHERE code = '3100' LIMIT 1;

  ELSIF v_op_type = 'inventory' THEN
    SELECT id INTO v_dr_account_id FROM accounts WHERE code = '1132' LIMIT 1;
    SELECT id INTO v_cr_account_id FROM accounts WHERE code = '3100' LIMIT 1;

  ELSIF v_op_type = 'asset' THEN
    SELECT id INTO v_dr_account_id FROM accounts WHERE code = '1213' LIMIT 1;
    SELECT id INTO v_cr_account_id FROM accounts WHERE code = '3100' LIMIT 1;

  ELSIF v_op_type IN ('operational', 'expense') THEN
    SELECT id INTO v_dr_account_id FROM accounts WHERE code = '6000' LIMIT 1;
    IF v_payment_method = 'cash' THEN
      SELECT id INTO v_cr_account_id FROM accounts WHERE code = '1110' LIMIT 1;
    ELSE
      SELECT id INTO v_cr_account_id FROM accounts WHERE code = '3100' LIMIT 1;
    END IF;

  ELSE
    RAISE EXCEPTION 'Unknown operation type: %. Use: capital, inventory, asset, operational', v_op_type;
  END IF;

  IF v_dr_account_id IS NULL THEN
    RAISE EXCEPTION 'Debit account not found for type: %', v_op_type;
  END IF;
  IF v_cr_account_id IS NULL THEN
    RAISE EXCEPTION 'Credit account not found';
  END IF;

  -- VAT transaction — cast text to vat_category_enum
  IF v_has_vat AND v_expense_id IS NOT NULL THEN
    INSERT INTO vat_transactions (
      id, source_type, source_id,
      taxable_amount, vat_amount,
      vat_category, tax_code, tax_rate,
      direction, period_month, period_year,
      transaction_date, branch_id, status,
      reference_type, reference_id, description,
      created_at
    ) VALUES (
      gen_random_uuid(), 'setup_expense', v_expense_id,
      v_net_amount, v_vat_amount,
      v_vat_category::vat_category_enum, 'S', 15,
      'input',
      EXTRACT(MONTH FROM v_expense_date)::int,
      EXTRACT(YEAR  FROM v_expense_date)::int,
      v_expense_date, v_branch_id, 'open',
      'setup_expense', v_expense_id,
      'VAT Input — ' || v_description,
      now()
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Journal Entry
  v_je_id := gen_random_uuid();
  v_je_number := 'JE-PARTNER-' || upper(v_op_type) || '-' ||
                 TO_CHAR(v_expense_date, 'YYYYMMDD') || '-' ||
                 SUBSTRING(COALESCE(v_expense_id::text, gen_random_uuid()::text), 1, 8);

  INSERT INTO journal_entries (
    id, entry_number, date, description,
    branch_id, reference_type, reference_id,
    status, created_by, created_at, updated_at
  ) VALUES (
    v_je_id, v_je_number, v_expense_date,
    v_op_type || ' — ' || v_description,
    v_branch_id,
    CASE WHEN v_expense_id IS NOT NULL THEN 'setup_expense' ELSE 'partner_operation' END,
    COALESCE(v_expense_id, v_je_id),
    'Draft', v_user_id, now(), now()
  );

  -- Dr (net)
  INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number, created_at)
  VALUES (gen_random_uuid(), v_je_id, v_dr_account_id, v_net_amount, 0, v_net_amount, 0,
    v_op_type || ' — ' || v_description, 1, now());

  -- Dr VAT
  IF v_has_vat AND v_vat_account_id IS NOT NULL THEN
    INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number, created_at)
    VALUES (gen_random_uuid(), v_je_id, v_vat_account_id, v_vat_amount, 0, v_vat_amount, 0,
      'VAT Input (2140) — ' || v_description, 2, now());

    INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number, created_at)
    VALUES (gen_random_uuid(), v_je_id, v_cr_account_id, 0, v_total_amount, 0, v_total_amount,
      CASE v_op_type
        WHEN 'capital'   THEN 'Partner Capital Injection — '
        WHEN 'inventory' THEN 'Partner Inventory Contribution — '
        WHEN 'asset'     THEN 'Partner Asset Contribution — '
        ELSE                  'Partner Expense Payment — '
      END || v_description, 3, now());
  ELSE
    INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number, created_at)
    VALUES (gen_random_uuid(), v_je_id, v_cr_account_id, 0, v_total_amount, 0, v_total_amount,
      CASE v_op_type
        WHEN 'capital'   THEN 'Partner Capital Injection — '
        WHEN 'inventory' THEN 'Partner Inventory Contribution — '
        WHEN 'asset'     THEN 'Partner Asset Contribution — '
        ELSE                  'Partner Expense Payment — '
      END || v_description, 2, now());
  END IF;

  -- Post
  UPDATE journal_entries
  SET status = 'Posted', posted_by = v_user_id, posted_at = now(), updated_at = now()
  WHERE id = v_je_id;

  PERFORM set_config('app.bypass_immutable', 'false', true);

  RETURN jsonb_build_object(
    'success',          true,
    'duplicate',        false,
    'journal_entry_id', v_je_id,
    'operation_type',   v_op_type,
    'net_amount',       v_net_amount,
    'vat_amount',       v_vat_amount,
    'total_amount',     v_total_amount,
    'vat_recorded',     v_has_vat,
    'message',          'Partner operation posted to GL successfully'
  );

EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.bypass_immutable', 'false', true);
  RAISE;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.post_partner_operation_atomic(jsonb) TO authenticated;
