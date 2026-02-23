/*
  # Phase 1 — Unified Purchase Receipt Processing (Atomic)

  ## Summary
  When a purchase is marked "received", ALL of the following must happen atomically:
    1. Idempotency check (prevent double-processing)
    2. Period lock check (respect accounting period locks)
    3. Inventory movement created (type = 'in') per line item
    4. inventory table quantity updated per product/branch
    5. product_costing updated with moving-average cost recalculation
    6. vat_transactions record inserted for VAT Input (if VAT applies)
    7. Journal entry created Draft → lines inserted → Posted

  ## New Function
  - `process_purchase_receipt_atomic(p_purchase_id uuid)` — replaces calling
    `update_purchase_status` + `create_purchase_receipt_journal_entry` separately.

  ## Idempotency Guard
  - Checks for existing inventory_movement with reference_type='purchase' and
    reference_id=purchase_id. If found, returns success without re-processing.
  - Also checks existing journal_entry with reference_type='purchase' and
    reference_id=purchase_id.

  ## Period Lock Guard
  - Reads accounting_periods table; if a closed period covers purchase_date → EXCEPTION.

  ## Moving Average Cost Formula
  - new_avg = (old_qty × old_avg + new_qty × new_unit_price) / (old_qty + new_qty)

  ## VAT Input
  - If purchase.vat_status_snapshot = 'standard' AND vat_amount > 0:
    * INSERT vat_transactions (type='input', amount=vat_amount)
    * Dr 2140 (VAT Recoverable) in journal

  ## Chart of Accounts Used
  - 1132  Inventory (Goods)
  - 2110  Accounts Payable
  - 2140  VAT Recoverable (Input)
  - 1110  Cash (when payment_method = 'cash' — AP bypassed, direct cash credit)

  ## Test Verification Query (run after calling function)
  SELECT
    (SELECT quantity_on_hand FROM product_costing WHERE product_id=X AND branch_id=Y)  AS qty,
    (SELECT average_cost     FROM product_costing WHERE product_id=X AND branch_id=Y)  AS avg_cost,
    (SELECT COUNT(*)         FROM inventory_movements WHERE reference_id=purchase_id)   AS movements,
    (SELECT COUNT(*)         FROM vat_transactions     WHERE reference_id=purchase_id)  AS vat_rows,
    (SELECT COUNT(*)         FROM journal_entries      WHERE reference_id=purchase_id
                                                        AND status='Posted')            AS gl_posted,
    (SELECT SUM(debit)-SUM(credit) FROM journal_lines  WHERE journal_entry_id IN (
       SELECT id FROM journal_entries WHERE reference_id=purchase_id))                  AS balance_check;
  -- balance_check must be 0 (balanced entry)
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- Ensure vat_transactions table has the columns we need
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'vat_transactions' AND table_schema = 'public'
  ) THEN
    CREATE TABLE public.vat_transactions (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      branch_id       uuid NOT NULL REFERENCES branches(id),
      transaction_date date NOT NULL,
      transaction_type text NOT NULL CHECK (transaction_type IN (
        'output','input','output_reversal','input_reversal'
      )),
      reference_type  text NOT NULL,
      reference_id    uuid NOT NULL,
      taxable_amount  numeric(15,2) NOT NULL DEFAULT 0,
      vat_amount      numeric(15,2) NOT NULL DEFAULT 0,
      vat_rate        numeric(5,2)  NOT NULL DEFAULT 15,
      description     text,
      created_by      uuid REFERENCES users(id),
      created_at      timestamptz DEFAULT now()
    );
    ALTER TABLE public.vat_transactions ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Add missing columns to vat_transactions if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='vat_transactions' AND column_name='reference_type') THEN
    ALTER TABLE public.vat_transactions ADD COLUMN reference_type text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='vat_transactions' AND column_name='reference_id') THEN
    ALTER TABLE public.vat_transactions ADD COLUMN reference_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='vat_transactions' AND column_name='taxable_amount') THEN
    ALTER TABLE public.vat_transactions ADD COLUMN taxable_amount numeric(15,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='vat_transactions' AND column_name='vat_rate') THEN
    ALTER TABLE public.vat_transactions ADD COLUMN vat_rate numeric(5,2) NOT NULL DEFAULT 15;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='vat_transactions' AND column_name='transaction_type') THEN
    ALTER TABLE public.vat_transactions ADD COLUMN transaction_type text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='vat_transactions' AND column_name='transaction_date') THEN
    ALTER TABLE public.vat_transactions ADD COLUMN transaction_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='vat_transactions' AND column_name='description') THEN
    ALTER TABLE public.vat_transactions ADD COLUMN description text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='vat_transactions' AND column_name='vat_amount') THEN
    ALTER TABLE public.vat_transactions ADD COLUMN vat_amount numeric(15,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- RLS policies for vat_transactions (if not already set)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'vat_transactions' AND policyname = 'Branch members can view vat transactions'
  ) THEN
    CREATE POLICY "Branch members can view vat transactions"
      ON public.vat_transactions FOR SELECT
      TO authenticated
      USING (
        branch_id IN (
          SELECT branch_id FROM users WHERE id = auth.uid()
        )
        OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','observer'))
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'vat_transactions' AND policyname = 'System can insert vat transactions'
  ) THEN
    CREATE POLICY "System can insert vat transactions"
      ON public.vat_transactions FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Add idempotency_key to purchases if not present
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='purchases' AND column_name='receipt_processed_at') THEN
    ALTER TABLE public.purchases ADD COLUMN receipt_processed_at timestamptz;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Core atomic function
-- ─────────────────────────────────────────────────────────────────────────────
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

  -- Inventory / costing
  v_old_qty         numeric := 0;
  v_old_avg         numeric := 0;
  v_new_avg         numeric := 0;

  -- Financial
  v_net_cost        numeric := 0;
  v_total_net       numeric := 0;
  v_vat_amount      numeric := 0;
  v_has_vat         boolean := false;
  v_total_value     numeric := 0;

  -- GL
  v_je_id           uuid;
  v_je_number       text;
  v_line_no         integer := 0;
  v_inv_account_id  uuid;
  v_ap_account_id   uuid;
  v_cash_account_id uuid;
  v_vat_account_id  uuid;
  v_credit_acct_id  uuid;

  -- Result
  v_movements_created integer := 0;
BEGIN
  -- ── GUARD 0: Bypass immutable trigger for this operation ──────────────────
  PERFORM set_config('app.bypass_immutable', 'true', true);

  -- ── LOAD PURCHASE ─────────────────────────────────────────────────────────
  SELECT * INTO v_purchase FROM purchases WHERE id = p_purchase_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase not found: %', p_purchase_id;
  END IF;

  IF v_purchase.status NOT IN ('confirmed', 'draft') THEN
    IF v_purchase.status = 'received' THEN
      -- Already received: idempotency — check if we processed it
      IF EXISTS (
        SELECT 1 FROM inventory_movements
        WHERE reference_type = 'purchase' AND reference_id = p_purchase_id
      ) THEN
        PERFORM set_config('app.bypass_immutable', 'false', true);
        RETURN jsonb_build_object(
          'success', true,
          'duplicate', true,
          'message', 'Purchase already processed — no changes made'
        );
      END IF;
      -- received but not yet processed — allow processing
    ELSE
      RAISE EXCEPTION 'Cannot receive purchase in status: %', v_purchase.status;
    END IF;
  END IF;

  -- ── IDEMPOTENCY CHECK ─────────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM inventory_movements
    WHERE reference_type = 'purchase' AND reference_id = p_purchase_id
  ) THEN
    -- Already has inventory movements → already processed, update status only
    UPDATE purchases SET status = 'received', updated_at = now()
    WHERE id = p_purchase_id AND status != 'received';

    PERFORM set_config('app.bypass_immutable', 'false', true);
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'message', 'Inventory movements already exist — status updated only'
    );
  END IF;

  v_branch_id    := v_purchase.branch_id;
  v_user_id      := COALESCE(auth.uid(), v_purchase.created_by);
  v_purchase_date := COALESCE(v_purchase.purchase_date::date, CURRENT_DATE);

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Purchase has no branch_id — cannot process receipt';
  END IF;

  -- ── GUARD 1: PERIOD LOCK ──────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM accounting_periods
    WHERE branch_id = v_branch_id
      AND is_locked = true
      AND start_date <= v_purchase_date
      AND end_date   >= v_purchase_date
  ) THEN
    PERFORM set_config('app.bypass_immutable', 'false', true);
    RAISE EXCEPTION 'Accounting period is locked for date %. Cannot post purchase receipt.', v_purchase_date;
  END IF;

  -- ── GET ACCOUNT IDs ───────────────────────────────────────────────────────
  SELECT id INTO v_inv_account_id  FROM accounts WHERE code = '1132' LIMIT 1;
  SELECT id INTO v_ap_account_id   FROM accounts WHERE code = '2110' LIMIT 1;
  SELECT id INTO v_cash_account_id FROM accounts WHERE code = '1110' LIMIT 1;
  SELECT id INTO v_vat_account_id  FROM accounts WHERE code = '2140' LIMIT 1;

  IF v_inv_account_id IS NULL THEN
    RAISE EXCEPTION 'Account 1132 (Inventory) not found in chart of accounts';
  END IF;
  IF v_ap_account_id IS NULL THEN
    RAISE EXCEPTION 'Account 2110 (Accounts Payable) not found in chart of accounts';
  END IF;

  -- Determine credit side: if cash payment → credit Cash, else → credit AP
  v_credit_acct_id := CASE
    WHEN v_purchase.payment_method = 'cash' AND v_cash_account_id IS NOT NULL
      THEN v_cash_account_id
    ELSE v_ap_account_id
  END;

  -- ── VAT DETERMINATION ─────────────────────────────────────────────────────
  IF COALESCE(v_purchase.vat_status_snapshot, '') = 'standard'
     AND COALESCE(v_purchase.vat_amount, 0) > 0 THEN
    v_has_vat    := true;
    v_vat_amount := ROUND(v_purchase.vat_amount, 2);
  END IF;

  v_total_value := ROUND(COALESCE(v_purchase.total, 0), 2);
  v_total_net   := ROUND(v_total_value - v_vat_amount, 2);

  -- ── STEP 1: PROCESS EACH LINE ITEM ────────────────────────────────────────
  FOR v_item IN
    SELECT
      pi.id,
      pi.product_id,
      pi.quantity,
      pi.unit_price,
      pi.total,
      COALESCE(p.type, 'product') AS product_type
    FROM purchase_items pi
    JOIN products p ON p.id = pi.product_id
    WHERE pi.purchase_id = p_purchase_id
      AND pi.quantity > 0
  LOOP
    -- Only process inventory-type items in inventory tables
    -- (asset and expense types handled in Phase 2)
    IF v_item.product_type NOT IN ('assets', 'fixed_asset') THEN

      -- 1a. Get current costing
      SELECT
        COALESCE(quantity_on_hand, 0),
        COALESCE(average_cost, 0)
      INTO v_old_qty, v_old_avg
      FROM product_costing
      WHERE product_id = v_item.product_id AND branch_id = v_branch_id;

      IF NOT FOUND THEN
        v_old_qty := 0;
        v_old_avg := 0;
      END IF;

      -- 1b. Moving average cost formula
      IF (v_old_qty + v_item.quantity) > 0 THEN
        v_new_avg := ROUND(
          (v_old_qty * v_old_avg + v_item.quantity * v_item.unit_price)
          / (v_old_qty + v_item.quantity),
          4
        );
      ELSE
        v_new_avg := v_item.unit_price;
      END IF;

      -- 1c. Upsert product_costing
      INSERT INTO product_costing (
        product_id, branch_id,
        quantity_on_hand, average_cost,
        last_purchase_date, created_at, updated_at
      ) VALUES (
        v_item.product_id, v_branch_id,
        v_item.quantity, v_new_avg,
        v_purchase_date, now(), now()
      )
      ON CONFLICT (product_id, branch_id) DO UPDATE
        SET quantity_on_hand  = product_costing.quantity_on_hand + v_item.quantity,
            average_cost      = v_new_avg,
            last_purchase_date = v_purchase_date,
            updated_at        = now();

      -- 1d. Update inventory table
      UPDATE inventory
      SET
        quantity     = COALESCE(quantity, 0) + v_item.quantity,
        last_updated = now()
      WHERE product_id = v_item.product_id AND branch_id = v_branch_id;

      IF NOT FOUND THEN
        INSERT INTO inventory (product_id, branch_id, quantity, last_updated)
        VALUES (v_item.product_id, v_branch_id, v_item.quantity, now())
        ON CONFLICT (product_id, branch_id) DO UPDATE
          SET quantity     = inventory.quantity + v_item.quantity,
              last_updated = now();
      END IF;

      -- 1e. Record inventory movement
      INSERT INTO inventory_movements (
        id, product_id, branch_id, movement_type,
        quantity, unit_cost,
        reference_type, reference_id,
        notes, created_by, created_at
      ) VALUES (
        gen_random_uuid(),
        v_item.product_id, v_branch_id, 'in',
        v_item.quantity, v_item.unit_price,
        'purchase', p_purchase_id,
        'Purchase Receipt: ' || v_purchase.purchase_number,
        v_user_id, now()
      );

      v_movements_created := v_movements_created + 1;

    END IF; -- end inventory-type check
  END LOOP;

  -- ── STEP 2: VAT TRANSACTION RECORD ────────────────────────────────────────
  IF v_has_vat THEN
    INSERT INTO vat_transactions (
      id, branch_id, transaction_date,
      transaction_type, reference_type, reference_id,
      taxable_amount, vat_amount, vat_rate,
      description, created_by, created_at
    ) VALUES (
      gen_random_uuid(),
      v_branch_id, v_purchase_date,
      'input', 'purchase', p_purchase_id,
      v_total_net, v_vat_amount, 15,
      'VAT Input — ' || v_purchase.purchase_number,
      v_user_id, now()
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- ── STEP 3: JOURNAL ENTRY (Draft → Lines → Post) ──────────────────────────
  -- Guard: prevent duplicate GL entry
  IF NOT EXISTS (
    SELECT 1 FROM journal_entries
    WHERE reference_type = 'purchase' AND reference_id = p_purchase_id
      AND status IN ('Draft', 'Posted')
  ) THEN
    v_je_id := gen_random_uuid();
    v_je_number := 'JE-PO-' || TO_CHAR(v_purchase_date, 'YYYYMMDD') || '-'
                   || SUBSTRING(p_purchase_id::text, 1, 8);

    -- 3a. Insert Draft
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

    -- 3b. Dr Inventory (net of VAT)
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

    -- 3c. Dr VAT Input (if applicable)
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

    -- 3d. Cr Accounts Payable (or Cash) — full invoice total
    v_line_no := v_line_no + 1;
    INSERT INTO journal_lines (
      id, journal_entry_id, account_id,
      debit, credit, base_debit, base_credit,
      description, line_number, created_at
    ) VALUES (
      gen_random_uuid(), v_je_id, v_credit_acct_id,
      0, v_total_value, 0, v_total_value,
      CASE
        WHEN v_purchase.payment_method = 'cash'
          THEN 'Cash Payment — ' || v_purchase.purchase_number
        ELSE 'Accounts Payable — ' || v_purchase.purchase_number
      END,
      v_line_no, now()
    );

    -- 3e. Post the entry
    UPDATE journal_entries
    SET status = 'Posted', posted_by = v_user_id, posted_at = now(), updated_at = now()
    WHERE id = v_je_id;

  END IF; -- end GL guard

  -- ── STEP 4: UPDATE PURCHASE STATUS ────────────────────────────────────────
  UPDATE purchases
  SET
    status             = 'received',
    receipt_processed_at = now(),
    updated_at         = now()
  WHERE id = p_purchase_id;

  -- ── CLEANUP ───────────────────────────────────────────────────────────────
  PERFORM set_config('app.bypass_immutable', 'false', true);

  RETURN jsonb_build_object(
    'success',            true,
    'duplicate',          false,
    'purchase_id',        p_purchase_id,
    'purchase_number',    v_purchase.purchase_number,
    'movements_created',  v_movements_created,
    'vat_recorded',       v_has_vat,
    'vat_amount',         v_vat_amount,
    'total_net',          v_total_net,
    'total_value',        v_total_value,
    'journal_entry_id',   v_je_id,
    'message',            'Purchase receipt processed successfully'
  );

EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.bypass_immutable', 'false', true);
  RAISE;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Grant execute
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.process_purchase_receipt_atomic(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- TEST VERIFICATION FUNCTION
-- Run after processing a receipt to confirm all 5 checks pass
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.test_purchase_receipt_integrity(p_purchase_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $test_fn$
DECLARE
  v_purchase          purchases%ROWTYPE;
  v_inv_movement_count integer;
  v_vat_count          integer;
  v_gl_posted          integer;
  v_gl_balance         numeric;
  v_product_qty_ok     boolean := true;
  v_result             jsonb;
BEGIN
  SELECT * INTO v_purchase FROM purchases WHERE id = p_purchase_id;

  -- Check 1: Inventory movements exist
  SELECT COUNT(*) INTO v_inv_movement_count
  FROM inventory_movements
  WHERE reference_type = 'purchase' AND reference_id = p_purchase_id;

  -- Check 2: VAT transaction exists (if purchase has VAT)
  SELECT COUNT(*) INTO v_vat_count
  FROM vat_transactions
  WHERE reference_type = 'purchase' AND reference_id = p_purchase_id;

  -- Check 3: GL entry is Posted
  SELECT COUNT(*) INTO v_gl_posted
  FROM journal_entries
  WHERE reference_type = 'purchase' AND reference_id = p_purchase_id
    AND status = 'Posted';

  -- Check 4: GL entry is balanced (Dr = Cr, so sum = 0)
  SELECT COALESCE(SUM(debit) - SUM(credit), 0) INTO v_gl_balance
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  WHERE je.reference_type = 'purchase' AND je.reference_id = p_purchase_id;

  -- Check 5: Status is 'received'
  v_result := jsonb_build_object(
    'purchase_number',      v_purchase.purchase_number,
    'status',               v_purchase.status,
    'check_1_inventory_movements', v_inv_movement_count,
    'check_2_vat_records',         v_vat_count,
    'check_3_gl_posted',           v_gl_posted,
    'check_4_gl_balanced',         (ABS(v_gl_balance) < 0.01),
    'check_4_gl_balance_diff',     v_gl_balance,
    'check_5_status_received',     (v_purchase.status = 'received'),
    'all_checks_passed',
      v_inv_movement_count > 0
      AND v_gl_posted > 0
      AND ABS(v_gl_balance) < 0.01
      AND v_purchase.status = 'received'
  );

  RETURN v_result;
END;
$test_fn$;

GRANT EXECUTE ON FUNCTION public.test_purchase_receipt_integrity(uuid) TO authenticated;
