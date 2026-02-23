/*
  # Fix process_purchase_receipt_atomic: correct accounting_periods column names
  
  accounting_periods uses `is_closed` (not `is_locked`) and has no `branch_id`.
  This patch updates the period lock guard accordingly.
*/

CREATE OR REPLACE FUNCTION public.process_purchase_receipt_atomic(p_purchase_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
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

  v_net_cost        numeric := 0;
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

  -- Status check
  IF v_purchase.status = 'received' THEN
    IF EXISTS (
      SELECT 1 FROM inventory_movements
      WHERE reference_type = 'purchase' AND reference_id = p_purchase_id
    ) THEN
      PERFORM set_config('app.bypass_immutable', 'false', true);
      RETURN jsonb_build_object('success', true, 'duplicate', true,
        'message', 'Purchase already processed — no changes made');
    END IF;
  ELSIF v_purchase.status NOT IN ('confirmed', 'draft') THEN
    RAISE EXCEPTION 'Cannot receive purchase in status: %', v_purchase.status;
  END IF;

  -- Idempotency
  IF EXISTS (
    SELECT 1 FROM inventory_movements
    WHERE reference_type = 'purchase' AND reference_id = p_purchase_id
  ) THEN
    UPDATE purchases SET status = 'received', updated_at = now()
    WHERE id = p_purchase_id AND status != 'received';
    PERFORM set_config('app.bypass_immutable', 'false', true);
    RETURN jsonb_build_object('success', true, 'duplicate', true,
      'message', 'Inventory movements already exist — status updated only');
  END IF;

  v_branch_id    := v_purchase.branch_id;
  v_user_id      := COALESCE(auth.uid(), v_purchase.created_by);
  v_purchase_date := COALESCE(v_purchase.purchase_date::date, CURRENT_DATE);

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Purchase has no branch_id — cannot process receipt';
  END IF;

  -- ── GUARD: PERIOD LOCK ────────────────────────────────────────────────────
  -- accounting_periods uses is_closed (no branch_id column)
  IF EXISTS (
    SELECT 1 FROM accounting_periods
    WHERE is_closed = true
      AND start_date <= v_purchase_date
      AND end_date   >= v_purchase_date
  ) THEN
    PERFORM set_config('app.bypass_immutable', 'false', true);
    RAISE EXCEPTION 'Accounting period is locked for date %. Cannot post purchase receipt.', v_purchase_date;
  END IF;

  -- ── GET ACCOUNTS ─────────────────────────────────────────────────────────
  SELECT id INTO v_inv_account_id  FROM accounts WHERE code = '1132' LIMIT 1;
  SELECT id INTO v_ap_account_id   FROM accounts WHERE code = '2110' LIMIT 1;
  SELECT id INTO v_cash_account_id FROM accounts WHERE code = '1110' LIMIT 1;
  SELECT id INTO v_vat_account_id  FROM accounts WHERE code = '2140' LIMIT 1;

  IF v_inv_account_id IS NULL THEN
    RAISE EXCEPTION 'Account 1132 (Inventory) not found';
  END IF;
  IF v_ap_account_id IS NULL THEN
    RAISE EXCEPTION 'Account 2110 (Accounts Payable) not found';
  END IF;

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

  -- ── STEP 1: PROCESS LINE ITEMS ────────────────────────────────────────────
  FOR v_item IN
    SELECT pi.product_id, pi.quantity, pi.unit_price, pi.total,
           COALESCE(p.type, 'natural_flowers') AS product_type
    FROM purchase_items pi
    JOIN products p ON p.id = pi.product_id
    WHERE pi.purchase_id = p_purchase_id AND pi.quantity > 0
  LOOP
    -- Skip only explicitly asset-type products (for Phase 2 handling)
    IF v_item.product_type NOT IN ('assets', 'fixed_asset') THEN

      SELECT COALESCE(quantity_on_hand, 0), COALESCE(average_cost, 0)
      INTO v_old_qty, v_old_avg
      FROM product_costing
      WHERE product_id = v_item.product_id AND branch_id = v_branch_id;

      IF NOT FOUND THEN v_old_qty := 0; v_old_avg := 0; END IF;

      -- Moving average cost
      IF (v_old_qty + v_item.quantity) > 0 THEN
        v_new_avg := ROUND(
          (v_old_qty * v_old_avg + v_item.quantity * v_item.unit_price)
          / (v_old_qty + v_item.quantity), 4);
      ELSE
        v_new_avg := v_item.unit_price;
      END IF;

      -- Upsert product_costing
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

      -- Update inventory
      UPDATE inventory
      SET quantity = COALESCE(quantity, 0) + v_item.quantity, last_updated = now()
      WHERE product_id = v_item.product_id AND branch_id = v_branch_id;

      IF NOT FOUND THEN
        INSERT INTO inventory (product_id, branch_id, quantity, last_updated)
        VALUES (v_item.product_id, v_branch_id, v_item.quantity, now())
        ON CONFLICT (product_id, branch_id) DO UPDATE
          SET quantity = inventory.quantity + v_item.quantity, last_updated = now();
      END IF;

      -- Inventory movement
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
    END IF;
  END LOOP;

  -- ── STEP 2: VAT TRANSACTION ───────────────────────────────────────────────
  IF v_has_vat THEN
    INSERT INTO vat_transactions (
      id, branch_id, transaction_date,
      transaction_type, reference_type, reference_id,
      taxable_amount, vat_amount, vat_rate,
      description, created_by, created_at
    ) VALUES (
      gen_random_uuid(), v_branch_id, v_purchase_date,
      'input', 'purchase', p_purchase_id,
      v_total_net, v_vat_amount, 15,
      'VAT Input — ' || v_purchase.purchase_number,
      v_user_id, now()
    )
    ON CONFLICT DO NOTHING;
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

    -- Dr Inventory (net of VAT)
    v_line_no := v_line_no + 1;
    INSERT INTO journal_lines (
      id, journal_entry_id, account_id,
      debit, credit, base_debit, base_credit,
      description, line_number, created_at
    ) VALUES (
      gen_random_uuid(), v_je_id, v_inv_account_id,
      v_total_net, 0, v_total_net, 0,
      'Inventory IN — ' || v_purchase.purchase_number,
      v_line_no, now()
    );

    -- Dr VAT Input
    IF v_has_vat AND v_vat_account_id IS NOT NULL THEN
      v_line_no := v_line_no + 1;
      INSERT INTO journal_lines (
        id, journal_entry_id, account_id,
        debit, credit, base_debit, base_credit,
        description, line_number, created_at
      ) VALUES (
        gen_random_uuid(), v_je_id, v_vat_account_id,
        v_vat_amount, 0, v_vat_amount, 0,
        'VAT Input (2140) — ' || v_purchase.purchase_number,
        v_line_no, now()
      );
    END IF;

    -- Cr AP or Cash
    v_line_no := v_line_no + 1;
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
      END,
      v_line_no, now()
    );

    -- Post
    UPDATE journal_entries
    SET status = 'Posted', posted_by = v_user_id, posted_at = now(), updated_at = now()
    WHERE id = v_je_id;
  END IF;

  -- ── STEP 4: UPDATE PURCHASE STATUS ────────────────────────────────────────
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

GRANT EXECUTE ON FUNCTION public.process_purchase_receipt_atomic(uuid) TO authenticated;
