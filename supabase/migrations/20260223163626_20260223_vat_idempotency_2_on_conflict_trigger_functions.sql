
/*
  # VAT Idempotency Fix — Part 2: Add ON CONFLICT to all trigger function INSERTs

  ## Problem
  Six trigger functions insert into vat_transactions without an ON CONFLICT clause.
  Now that the unique constraint `uq_vat_tx_source_direction` exists on
  (source_type, source_id, direction), any concurrent or duplicate call will raise
  a unique violation instead of silently deduplicating.

  ## Fix
  Recreate all six trigger functions with:
    ON CONFLICT (source_type, source_id, direction) DO NOTHING

  replacing the bare INSERT. The existing DELETE-before-INSERT logic is preserved
  exactly — this is purely additive idempotency at the constraint level.

  ## Functions Updated
  1. record_vat_tx_from_sale
  2. record_vat_tx_from_purchase
  3. record_vat_tx_from_operating_expense
  4. record_vat_tx_from_setup_expense
  5. record_vat_tx_from_partner_contribution
  6. process_purchase_receipt_atomic  (already had ON CONFLICT DO NOTHING — updated to named constraint)
  7. post_partner_operation_atomic    (already had ON CONFLICT DO NOTHING — updated to named constraint)

  ## Notes
  - Business logic is NOT changed in any function.
  - Triggers are NOT re-created — only the function bodies are updated.
  - SECURITY DEFINER and SET search_path are preserved on all functions.
*/

-- ── 1. record_vat_tx_from_sale ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_vat_tx_from_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tax   numeric := COALESCE(NEW.tax, 0);
  v_net   numeric := COALESCE(NEW.subtotal, 0);
  v_month integer;
  v_year  integer;
BEGIN
  IF NEW.status NOT IN ('confirmed','completed','returned') THEN
    RETURN NEW;
  END IF;
  IF v_tax <= 0 THEN
    RETURN NEW;
  END IF;

  v_month := EXTRACT(MONTH FROM NEW.sale_date::date)::integer;
  v_year  := EXTRACT(YEAR  FROM NEW.sale_date::date)::integer;

  DELETE FROM vat_transactions WHERE source_type = 'sale' AND source_id = NEW.id;

  INSERT INTO vat_transactions (
    source_type, source_id, invoice_number,
    taxable_amount, vat_amount, vat_category, tax_code, tax_rate,
    direction, period_month, period_year, transaction_date, branch_id
  ) VALUES (
    'sale', NEW.id, NEW.sale_number,
    v_net, v_tax, 'standard', 'S', 15,
    'output', v_month, v_year, NEW.sale_date::date, NEW.branch_id
  )
  ON CONFLICT (source_type, source_id, direction) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- ── 2. record_vat_tx_from_purchase ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_vat_tx_from_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_vat    numeric := COALESCE(NEW.vat_amount, 0);
  v_net    numeric := COALESCE(NEW.subtotal, 0);
  v_cat    vat_category_enum;
  v_code   text    := 'S';
  v_rate   numeric := 0;
  v_month  integer;
  v_year   integer;
BEGIN
  IF NEW.is_deleted IS TRUE THEN
    DELETE FROM vat_transactions WHERE source_type = 'purchase' AND source_id = NEW.id;
    RETURN NEW;
  END IF;
  IF v_vat <= 0 THEN
    RETURN NEW;
  END IF;

  CASE COALESCE(NEW.vat_status_snapshot, 'standard')
    WHEN 'standard'      THEN v_cat := 'standard';      v_code := 'S'; v_rate := 15;
    WHEN 'zero_rated'    THEN v_cat := 'zero_rated';     v_code := 'Z'; v_rate := 0;
    WHEN 'exempt'        THEN v_cat := 'exempt';         v_code := 'E'; v_rate := 0;
    WHEN 'outside_scope' THEN v_cat := 'outside_scope';  v_code := 'O'; v_rate := 0;
    ELSE                      v_cat := 'standard';      v_code := 'S'; v_rate := 15;
  END CASE;

  v_month := EXTRACT(MONTH FROM NEW.purchase_date)::integer;
  v_year  := EXTRACT(YEAR  FROM NEW.purchase_date)::integer;

  DELETE FROM vat_transactions WHERE source_type = 'purchase' AND source_id = NEW.id;

  INSERT INTO vat_transactions (
    source_type, source_id, supplier_id, invoice_number,
    taxable_amount, vat_amount, vat_category, tax_code, tax_rate,
    direction, period_month, period_year, transaction_date, branch_id
  ) VALUES (
    'purchase', NEW.id, NEW.supplier_id, NEW.purchase_number,
    v_net, v_vat, v_cat, v_code, v_rate,
    'input', v_month, v_year, NEW.purchase_date, NEW.branch_id
  )
  ON CONFLICT (source_type, source_id, direction) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- ── 3. record_vat_tx_from_operating_expense ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_vat_tx_from_operating_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_vat   numeric := COALESCE(NEW.vat_amount, 0);
  v_net   numeric := COALESCE(NEW.net_amount, NEW.amount, 0);
  v_month integer;
  v_year  integer;
BEGIN
  IF NEW.is_deleted IS TRUE THEN
    DELETE FROM vat_transactions WHERE source_type = 'operating_expense' AND source_id = NEW.id;
    RETURN NEW;
  END IF;
  IF v_vat <= 0 THEN
    RETURN NEW;
  END IF;

  v_month := EXTRACT(MONTH FROM NEW.expense_date)::integer;
  v_year  := EXTRACT(YEAR  FROM NEW.expense_date)::integer;

  DELETE FROM vat_transactions WHERE source_type = 'operating_expense' AND source_id = NEW.id;

  INSERT INTO vat_transactions (
    source_type, source_id, invoice_number,
    taxable_amount, vat_amount, vat_category, tax_code, tax_rate,
    direction, period_month, period_year, transaction_date, branch_id
  ) VALUES (
    'operating_expense', NEW.id, NEW.expense_number,
    v_net, v_vat, NEW.vat_category, NEW.tax_code, NEW.tax_rate,
    'input', v_month, v_year, NEW.expense_date, NEW.branch_id
  )
  ON CONFLICT (source_type, source_id, direction) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- ── 4. record_vat_tx_from_setup_expense ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_vat_tx_from_setup_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_vat   numeric := COALESCE(NEW.vat_amount, 0);
  v_net   numeric := COALESCE(NEW.net_amount, NEW.amount, 0);
  v_month integer;
  v_year  integer;
BEGIN
  IF NEW.is_deleted IS TRUE THEN
    DELETE FROM vat_transactions WHERE source_type = 'setup_expense' AND source_id = NEW.id;
    RETURN NEW;
  END IF;
  IF v_vat <= 0 THEN
    RETURN NEW;
  END IF;

  v_month := EXTRACT(MONTH FROM NEW.expense_date)::integer;
  v_year  := EXTRACT(YEAR  FROM NEW.expense_date)::integer;

  DELETE FROM vat_transactions WHERE source_type = 'setup_expense' AND source_id = NEW.id;

  INSERT INTO vat_transactions (
    source_type, source_id, invoice_number,
    taxable_amount, vat_amount, vat_category, tax_code, tax_rate,
    direction, period_month, period_year, transaction_date, branch_id
  ) VALUES (
    'setup_expense', NEW.id, NEW.receipt_number,
    v_net, v_vat, NEW.vat_category, NEW.tax_code, NEW.tax_rate,
    'input', v_month, v_year, NEW.expense_date, NEW.branch_id
  )
  ON CONFLICT (source_type, source_id, direction) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- ── 5. record_vat_tx_from_partner_contribution ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_vat_tx_from_partner_contribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_vat   numeric := COALESCE(NEW.vat_amount, 0);
  v_net   numeric := COALESCE(NEW.net_amount, NEW.amount, 0);
  v_month integer;
  v_year  integer;
BEGIN
  IF COALESCE(NEW.contribution_type,'') != 'reimbursement' THEN
    RETURN NEW;
  END IF;
  IF NEW.is_deleted IS TRUE THEN
    DELETE FROM vat_transactions WHERE source_type = 'partner_contribution' AND source_id = NEW.id;
    RETURN NEW;
  END IF;
  IF v_vat <= 0 THEN
    RETURN NEW;
  END IF;

  v_month := EXTRACT(MONTH FROM NEW.contribution_date)::integer;
  v_year  := EXTRACT(YEAR  FROM NEW.contribution_date)::integer;

  DELETE FROM vat_transactions WHERE source_type = 'partner_contribution' AND source_id = NEW.id;

  INSERT INTO vat_transactions (
    source_type, source_id, supplier_id,
    taxable_amount, vat_amount, vat_category, tax_code, tax_rate,
    direction, period_month, period_year, transaction_date
  ) VALUES (
    'partner_contribution', NEW.id, NEW.partner_id,
    v_net, v_vat, NEW.vat_category, NEW.tax_code, NEW.tax_rate,
    'input', v_month, v_year, NEW.contribution_date
  )
  ON CONFLICT (source_type, source_id, direction) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- ── 6. process_purchase_receipt_atomic — upgrade to named constraint ──────────────────────
CREATE OR REPLACE FUNCTION public.process_purchase_receipt_atomic(p_purchase_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
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
BEGIN
  PERFORM set_config('app.bypass_immutable', 'true', true);

  SELECT * INTO v_purchase FROM purchases WHERE id = p_purchase_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase not found: %', p_purchase_id;
  END IF;

  -- ── IDEMPOTENCY / STATUS ──────────────────────────────────────────────────
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

  -- ── PERIOD LOCK ───────────────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM accounting_periods
    WHERE is_closed = true
      AND start_date <= v_purchase_date
      AND end_date   >= v_purchase_date
  ) THEN
    PERFORM set_config('app.bypass_immutable', 'false', true);
    RAISE EXCEPTION 'Accounting period is locked for date %', v_purchase_date;
  END IF;

  -- ── ACCOUNTS ──────────────────────────────────────────────────────────────
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

  -- ── VAT ───────────────────────────────────────────────────────────────────
  IF COALESCE(v_purchase.vat_status_snapshot, '') = 'standard'
     AND COALESCE(v_purchase.vat_amount, 0) > 0 THEN
    v_has_vat    := true;
    v_vat_amount := ROUND(v_purchase.vat_amount, 2);
  END IF;

  v_total_value := ROUND(COALESCE(v_purchase.total, 0), 2);
  v_total_net   := ROUND(v_total_value - v_vat_amount, 2);

  -- ── STEP 1: LINE ITEMS ────────────────────────────────────────────────────
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

  -- ── STEP 2: VAT TRANSACTION ───────────────────────────────────────────────
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

  -- ── STEP 3: JOURNAL ENTRY ─────────────────────────────────────────────────
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

  -- ── STEP 4: UPDATE STATUS ─────────────────────────────────────────────────
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
$function$;

-- ── 7. post_partner_operation_atomic — upgrade to named constraint ────────────────────────
CREATE OR REPLACE FUNCTION public.post_partner_operation_atomic(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
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

  IF EXISTS (
    SELECT 1 FROM accounting_periods
    WHERE is_closed = true
      AND start_date <= v_expense_date
      AND end_date   >= v_expense_date
  ) THEN
    PERFORM set_config('app.bypass_immutable', 'false', true);
    RAISE EXCEPTION 'Accounting period is locked for date %', v_expense_date;
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
$function$;
