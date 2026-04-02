/*
  # Fix All Period Lock Functions - Super Admin Bypass

  1. Problem
    - Multiple period-lock trigger functions and atomic functions lack Super Admin bypass
    - Old triggers on journal_entries (check_period_lock, enforce_period_locking) block operations
      before the newer trigger (protect_journal_entries_closed_periods) with bypass logic runs
    - Atomic functions (post_partner_operation_atomic, process_purchase_receipt_atomic) check
      period lock inline without consulting fn_can_bypass_period_lock()

  2. Changes
    - Drop redundant old triggers: trg_check_period_lock, enforce_period_locking
    - Update fn_check_period_open() to accept Super Admin bypass
    - Update check_period_lock() with Super Admin bypass + audit logging
    - Update post_partner_operation_atomic() with Super Admin bypass + audit logging
    - Update process_purchase_receipt_atomic() with Super Admin bypass + audit logging
    - fn_period_lock_journal_lines, fn_period_lock_purchases, fn_period_lock_sales
      all call fn_check_period_open() which will now have bypass logic

  3. Security
    - Only super_admin role can bypass period locks
    - All bypasses are logged to audit_logs table
    - Regular users remain fully restricted
*/

-- ============================================================================
-- STEP 1: Drop redundant old triggers on journal_entries
-- The newer trg_protect_journal_entries_closed_periods handles everything
-- ============================================================================
DROP TRIGGER IF EXISTS trg_check_period_lock ON journal_entries;
DROP TRIGGER IF EXISTS enforce_period_locking ON journal_entries;

-- ============================================================================
-- STEP 2: Update fn_check_period_open() - the shared helper used by multiple triggers
-- Now checks if user is super_admin and allows bypass with audit logging
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_check_period_open(p_check_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period RECORD;
  v_is_super_admin BOOLEAN;
BEGIN
  SELECT * INTO v_period
  FROM accounting_periods
  WHERE p_check_date BETWEEN start_date AND end_date
    AND (is_closed = true OR status = 'Closed')
  LIMIT 1;

  IF FOUND THEN
    v_is_super_admin := fn_can_bypass_period_lock();

    IF v_is_super_admin THEN
      INSERT INTO audit_logs (
        id, user_id, action, table_name,
        metadata, created_at
      ) VALUES (
        gen_random_uuid(),
        auth.uid(),
        'CLOSED_PERIOD_BYPASS',
        'fn_check_period_open',
        jsonb_build_object(
          'period_name', v_period.name,
          'period_id', v_period.id,
          'check_date', p_check_date,
          'start_date', v_period.start_date,
          'end_date', v_period.end_date,
          'bypassed_at', now(),
          'warning', 'Super Admin bypassed period lock via fn_check_period_open'
        ),
        now()
      );
      RETURN;
    END IF;

    RAISE EXCEPTION 'PERIOD LOCKED: Cannot modify records in closed accounting period "%" (% to %). Reopen the period to make changes.',
      v_period.name, v_period.start_date, v_period.end_date;
  END IF;
END;
$$;

-- ============================================================================
-- STEP 3: Update check_period_lock() - kept for any remaining references
-- Now includes Super Admin bypass with audit logging
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_period_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_closed BOOLEAN;
  v_period_name VARCHAR(100);
  v_is_super_admin BOOLEAN;
BEGIN
  IF NEW.status = 'Posted' OR (OLD IS NOT NULL AND OLD.status = 'Posted') THEN
    SELECT is_closed, name INTO v_is_closed, v_period_name
    FROM accounting_periods
    WHERE NEW.date BETWEEN start_date AND end_date
      AND (is_closed = true OR status = 'Closed')
    LIMIT 1;

    IF v_is_closed THEN
      v_is_super_admin := fn_can_bypass_period_lock();

      IF v_is_super_admin THEN
        INSERT INTO audit_logs (
          id, user_id, action, table_name, record_id,
          metadata, created_at
        ) VALUES (
          gen_random_uuid(),
          auth.uid(),
          'CLOSED_PERIOD_BYPASS',
          'journal_entries',
          NEW.id,
          jsonb_build_object(
            'period_name', v_period_name,
            'entry_number', NEW.entry_number,
            'entry_date', NEW.date,
            'operation', TG_OP,
            'bypassed_at', now(),
            'warning', 'Super Admin posted journal entry in closed period'
          ),
          now()
        );
      ELSE
        RAISE EXCEPTION 'Cannot post to closed period: %', v_period_name;
      END IF;
    END IF;

    SELECT is_closed INTO v_is_closed
    FROM accounting_periods
    WHERE NEW.date BETWEEN start_date AND end_date
    LIMIT 1;

    IF FOUND THEN
      NEW.period_locked := v_is_closed;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- STEP 4: Update post_partner_operation_atomic() - inline period check with bypass
-- ============================================================================
CREATE OR REPLACE FUNCTION public.post_partner_operation_atomic(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

  v_expense        setup_expenses%ROWTYPE;
  v_is_super_admin boolean;
  v_period_name    text;
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

  v_user_id := COALESCE(
    auth.uid(),
    NULLIF(p_payload->>'created_by', '')::uuid,
    (SELECT created_by FROM setup_expenses WHERE id = v_expense_id LIMIT 1),
    (SELECT id FROM users WHERE role IN ('super_admin','admin') ORDER BY created_at LIMIT 1)
  );

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

  -- Period lock check with Super Admin bypass
  IF EXISTS (
    SELECT 1 FROM accounting_periods
    WHERE is_closed = true
      AND start_date <= v_expense_date
      AND end_date   >= v_expense_date
  ) THEN
    v_is_super_admin := fn_can_bypass_period_lock();

    IF v_is_super_admin THEN
      SELECT name INTO v_period_name
      FROM accounting_periods
      WHERE is_closed = true
        AND start_date <= v_expense_date
        AND end_date   >= v_expense_date
      LIMIT 1;

      INSERT INTO audit_logs (
        id, user_id, action, table_name,
        metadata, created_at
      ) VALUES (
        gen_random_uuid(),
        auth.uid(),
        'CLOSED_PERIOD_BYPASS',
        'setup_expenses',
        jsonb_build_object(
          'function', 'post_partner_operation_atomic',
          'period_name', v_period_name,
          'expense_id', v_expense_id,
          'expense_date', v_expense_date,
          'operation_type', v_op_type,
          'amount', v_amount,
          'bypassed_at', now(),
          'warning', 'Super Admin posted partner operation in closed period'
        ),
        now()
      );
    ELSE
      PERFORM set_config('app.bypass_immutable', 'false', true);
      RAISE EXCEPTION 'Accounting period is locked for date %', v_expense_date;
    END IF;
  END IF;

  v_has_vat      := v_vat_category = 'standard' AND v_vat_amount > 0;
  v_vat_amount   := CASE WHEN v_has_vat THEN ROUND(v_vat_amount, 2) ELSE 0 END;
  v_total_amount := ROUND(v_amount, 2);
  v_net_amount   := ROUND(v_total_amount - v_vat_amount, 2);

  SELECT id INTO v_vat_account_id FROM accounts WHERE code = '2140' LIMIT 1;

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
    ON CONFLICT (source_type, source_id, direction) DO NOTHING;
  END IF;

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

  INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number, created_at)
  VALUES (gen_random_uuid(), v_je_id, v_dr_account_id, v_net_amount, 0, v_net_amount, 0,
    v_op_type || ' — ' || v_description, 1, now());

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
$$;

-- ============================================================================
-- STEP 5: Update process_purchase_receipt_atomic() - inline period check with bypass
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_purchase_receipt_atomic(p_purchase_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_purchase        purchases%ROWTYPE;
  v_item            RECORD;
  v_branch_id       uuid;
  v_user_id         uuid;
  v_purchase_date   date;

  v_old_qty         numeric := 0;
  v_old_avg         numeric := 0;
  v_new_avg         numeric := 0;

  v_total_net       numeric := 0;
  v_vat_amount      numeric := 0;
  v_has_vat         boolean := false;
  v_total_value     numeric := 0;

  v_je_id           uuid;
  v_je_number       text;
  v_line_no         integer := 0;
  v_inv_account_id  uuid;
  v_ap_account_id   uuid;
  v_cash_account_id uuid;
  v_vat_account_id  uuid;
  v_credit_acct_id  uuid;

  v_movements_created integer := 0;
  v_is_super_admin  boolean;
  v_period_name     text;
BEGIN
  PERFORM set_config('app.bypass_immutable', 'true', true);

  SELECT * INTO v_purchase FROM purchases WHERE id = p_purchase_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase not found: %', p_purchase_id;
  END IF;

  IF v_purchase.status = 'received' OR EXISTS (
    SELECT 1 FROM inventory_movements
    WHERE reference_type = 'purchase' AND reference_id = p_purchase_id
  ) THEN
    UPDATE purchases SET status = 'received', updated_at = now()
    WHERE id = p_purchase_id AND status != 'received';
    PERFORM set_config('app.bypass_immutable', 'false', true);
    RETURN jsonb_build_object('success', true, 'duplicate', true,
      'message', 'Purchase already processed — no changes made');
  END IF;

  IF v_purchase.status NOT IN ('confirmed', 'draft') THEN
    RAISE EXCEPTION 'Cannot receive purchase in status: %', v_purchase.status;
  END IF;

  v_branch_id     := v_purchase.branch_id;
  v_user_id       := COALESCE(auth.uid(), v_purchase.created_by);
  v_purchase_date := COALESCE(v_purchase.purchase_date::date, CURRENT_DATE);

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Purchase has no branch_id';
  END IF;

  -- Period lock check with Super Admin bypass
  IF EXISTS (
    SELECT 1 FROM accounting_periods
    WHERE is_closed = true
      AND start_date <= v_purchase_date
      AND end_date   >= v_purchase_date
  ) THEN
    v_is_super_admin := fn_can_bypass_period_lock();

    IF v_is_super_admin THEN
      SELECT name INTO v_period_name
      FROM accounting_periods
      WHERE is_closed = true
        AND start_date <= v_purchase_date
        AND end_date   >= v_purchase_date
      LIMIT 1;

      INSERT INTO audit_logs (
        id, user_id, action, table_name, record_id,
        metadata, created_at
      ) VALUES (
        gen_random_uuid(),
        auth.uid(),
        'CLOSED_PERIOD_BYPASS',
        'purchases',
        p_purchase_id,
        jsonb_build_object(
          'function', 'process_purchase_receipt_atomic',
          'period_name', v_period_name,
          'purchase_date', v_purchase_date,
          'purchase_number', v_purchase.purchase_number,
          'bypassed_at', now(),
          'warning', 'Super Admin processed purchase receipt in closed period'
        ),
        now()
      );
    ELSE
      PERFORM set_config('app.bypass_immutable', 'false', true);
      RAISE EXCEPTION 'Accounting period is locked for date %', v_purchase_date;
    END IF;
  END IF;

  SELECT id INTO v_inv_account_id  FROM accounts WHERE code = '1132' LIMIT 1;
  SELECT id INTO v_ap_account_id   FROM accounts WHERE code = '2110' LIMIT 1;
  SELECT id INTO v_cash_account_id FROM accounts WHERE code = '1110' LIMIT 1;
  SELECT id INTO v_vat_account_id  FROM accounts WHERE code = '2140' LIMIT 1;

  IF v_inv_account_id IS NULL THEN RAISE EXCEPTION 'Account 1132 not found'; END IF;
  IF v_ap_account_id  IS NULL THEN RAISE EXCEPTION 'Account 2110 not found'; END IF;

  v_credit_acct_id := CASE
    WHEN v_purchase.payment_method = 'cash' AND v_cash_account_id IS NOT NULL
    THEN v_cash_account_id
    ELSE v_ap_account_id
  END;

  IF COALESCE(v_purchase.vat_status_snapshot, '') = 'standard'
     AND COALESCE(v_purchase.vat_amount, 0) > 0 THEN
    v_has_vat    := true;
    v_vat_amount := ROUND(v_purchase.vat_amount, 2);
  END IF;

  v_total_value := ROUND(COALESCE(v_purchase.total, 0), 2);
  v_total_net   := ROUND(v_total_value - v_vat_amount, 2);

  FOR v_item IN
    SELECT pi.product_id, pi.quantity, pi.unit_price
    FROM purchase_items pi
    JOIN products p ON p.id = pi.product_id
    WHERE pi.purchase_id = p_purchase_id AND pi.quantity > 0
  LOOP
    SELECT COALESCE(quantity_on_hand, 0), COALESCE(average_cost, 0)
    INTO v_old_qty, v_old_avg
    FROM product_costing
    WHERE product_id = v_item.product_id AND branch_id = v_branch_id;

    IF NOT FOUND THEN v_old_qty := 0; v_old_avg := 0; END IF;

    IF (v_old_qty + v_item.quantity) > 0 THEN
      v_new_avg := ROUND(
        (v_old_qty * v_old_avg + v_item.quantity * v_item.unit_price)
        / (v_old_qty + v_item.quantity), 4);
    ELSE
      v_new_avg := v_item.unit_price;
    END IF;

    INSERT INTO product_costing (
      product_id, branch_id, quantity_on_hand, average_cost,
      last_purchase_date, created_at, updated_at
    ) VALUES (
      v_item.product_id, v_branch_id,
      v_item.quantity, v_new_avg,
      v_purchase_date, now(), now()
    )
    ON CONFLICT (product_id, branch_id) DO UPDATE
    SET quantity_on_hand   = product_costing.quantity_on_hand + v_item.quantity,
        average_cost       = v_new_avg,
        last_purchase_date = v_purchase_date,
        updated_at         = now();

    UPDATE inventory
    SET quantity = COALESCE(quantity, 0) + v_item.quantity, last_updated = now()
    WHERE product_id = v_item.product_id AND branch_id = v_branch_id;

    IF NOT FOUND THEN
      INSERT INTO inventory (product_id, branch_id, quantity, last_updated)
      VALUES (v_item.product_id, v_branch_id, v_item.quantity, now())
      ON CONFLICT (product_id, branch_id) DO UPDATE
      SET quantity = inventory.quantity + v_item.quantity, last_updated = now();
    END IF;

    INSERT INTO inventory_movements (
      id, product_id, branch_id, movement_type,
      quantity, unit_cost, reference_type, reference_id,
      notes, created_by, created_at
    ) VALUES (
      gen_random_uuid(), v_item.product_id, v_branch_id, 'in',
      v_item.quantity, v_item.unit_price,
      'purchase', p_purchase_id,
      'Purchase Receipt: ' || v_purchase.purchase_number,
      v_user_id, now()
    );

    v_movements_created := v_movements_created + 1;
  END LOOP;

  IF v_has_vat THEN
    INSERT INTO vat_transactions (
      id, source_type, source_id,
      supplier_id, invoice_number,
      taxable_amount, vat_amount, vat_category, tax_code, tax_rate,
      direction, period_month, period_year,
      transaction_date, branch_id, status,
      reference_type, reference_id, description,
      created_at
    ) VALUES (
      gen_random_uuid(), 'purchase', p_purchase_id,
      v_purchase.supplier_id, v_purchase.purchase_number,
      v_total_net, v_vat_amount, 'standard', 'S', 15,
      'input',
      EXTRACT(MONTH FROM v_purchase_date)::int,
      EXTRACT(YEAR  FROM v_purchase_date)::int,
      v_purchase_date, v_branch_id, 'open',
      'purchase', p_purchase_id,
      'VAT Input — ' || v_purchase.purchase_number,
      now()
    )
    ON CONFLICT (source_type, source_id, direction) DO NOTHING;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM journal_entries
    WHERE reference_type = 'purchase' AND reference_id = p_purchase_id
      AND status IN ('Draft', 'Posted')
  ) THEN
    v_je_id := gen_random_uuid();
    v_je_number := 'JE-PO-' || TO_CHAR(v_purchase_date, 'YYYYMMDD') || '-'
      || SUBSTRING(p_purchase_id::text, 1, 8);

    INSERT INTO journal_entries (
      id, entry_number, date, description,
      branch_id, reference_type, reference_id,
      status, created_by, created_at, updated_at
    ) VALUES (
      v_je_id, v_je_number, v_purchase_date,
      'Purchase Receipt — ' || v_purchase.purchase_number,
      v_branch_id, 'purchase', p_purchase_id,
      'Draft', v_user_id, now(), now()
    );

    INSERT INTO journal_lines (
      id, journal_entry_id, account_id,
      debit, credit, base_debit, base_credit,
      description, line_number, created_at
    ) VALUES (
      gen_random_uuid(), v_je_id, v_inv_account_id,
      v_total_net, 0, v_total_net, 0,
      'Inventory IN — ' || v_purchase.purchase_number, 1, now()
    );

    IF v_has_vat AND v_vat_account_id IS NOT NULL THEN
      INSERT INTO journal_lines (
        id, journal_entry_id, account_id,
        debit, credit, base_debit, base_credit,
        description, line_number, created_at
      ) VALUES (
        gen_random_uuid(), v_je_id, v_vat_account_id,
        v_vat_amount, 0, v_vat_amount, 0,
        'VAT Input (2140) — ' || v_purchase.purchase_number, 2, now()
      );

      INSERT INTO journal_lines (
        id, journal_entry_id, account_id,
        debit, credit, base_debit, base_credit,
        description, line_number, created_at
      ) VALUES (
        gen_random_uuid(), v_je_id, v_credit_acct_id,
        0, v_total_value, 0, v_total_value,
        CASE WHEN v_purchase.payment_method = 'cash'
          THEN 'Cash Payment — ' || v_purchase.purchase_number
          ELSE 'Accounts Payable — ' || v_purchase.purchase_number
        END, 3, now()
      );
    ELSE
      INSERT INTO journal_lines (
        id, journal_entry_id, account_id,
        debit, credit, base_debit, base_credit,
        description, line_number, created_at
      ) VALUES (
        gen_random_uuid(), v_je_id, v_credit_acct_id,
        0, v_total_value, 0, v_total_value,
        CASE WHEN v_purchase.payment_method = 'cash'
          THEN 'Cash Payment — ' || v_purchase.purchase_number
          ELSE 'Accounts Payable — ' || v_purchase.purchase_number
        END, 2, now()
      );
    END IF;

    UPDATE journal_entries
    SET status = 'Posted', posted_by = v_user_id, posted_at = now(), updated_at = now()
    WHERE id = v_je_id;
  END IF;

  UPDATE purchases
  SET status = 'received', receipt_processed_at = now(), updated_at = now()
  WHERE id = p_purchase_id;

  PERFORM set_config('app.bypass_immutable', 'false', true);

  RETURN jsonb_build_object(
    'success',           true,
    'duplicate',         false,
    'purchase_id',       p_purchase_id,
    'purchase_number',   v_purchase.purchase_number,
    'movements_created', v_movements_created,
    'vat_recorded',      v_has_vat,
    'vat_amount',        v_vat_amount,
    'total_net',         v_total_net,
    'total_value',       v_total_value,
    'journal_entry_id',  v_je_id,
    'message',           'Purchase receipt processed successfully'
  );

EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.bypass_immutable', 'false', true);
  RAISE;
END;
$$;

-- ============================================================================
-- STEP 6: Update protect_closed_periods() to also include Super Admin bypass
-- This function is called by enforce_period_locking trigger (now dropped)
-- but kept for backward compatibility
-- ============================================================================
CREATE OR REPLACE FUNCTION public.protect_closed_periods()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry_date DATE;
BEGIN
  IF current_setting('app.bypass_immutable', true) = 'true' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_entry_date := OLD.date;
  ELSE
    v_entry_date := NEW.date;
  END IF;

  IF v_entry_date IS NOT NULL THEN
    PERFORM public.fn_check_period_open(v_entry_date);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;
