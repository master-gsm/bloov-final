/*
  # Stabilization Patch 1: Complete Atomic Sales with GL, Cash Register, and Block Direct INSERT

  ## Summary
  This migration enforces that ALL sales must go through create_sale_atomic() exclusively.
  It rewrites the function to guarantee, in a single transaction:
    1. Stock validation (no negative inventory)
    2. Inventory OUT movement
    3. Revenue GL journal entry (Dr Cash/AR → Cr Revenue)
    4. COGS GL journal entry (Dr COGS → Cr Inventory)
    5. Commission creation for salesperson
    6. Cash register movement if payment_method = cash

  ## Changes
  - Drops and recreates create_sale_atomic() with full GL + cash register support
  - Adds idempotency_key column to sales
  - Adds RLS policy to block direct INSERT on sales from authenticated users
*/

-- ============================================================
-- 1. ADD idempotency_key column to sales if not present
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE sales ADD COLUMN idempotency_key text;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_idempotency_key
      ON sales (idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;

-- ============================================================
-- 2. COMPLETE create_sale_atomic() WITH GL + CASH REGISTER
-- ============================================================
CREATE OR REPLACE FUNCTION create_sale_atomic(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id         uuid;
  v_sale_number     text;
  v_branch_id       uuid;
  v_created_by      uuid;
  v_payment_method  text;
  v_items           jsonb;
  v_item            jsonb;
  v_product_id      uuid;
  v_qty             numeric;
  v_stock_qty       numeric;
  v_total_cost      numeric := 0;
  v_gross_profit    numeric := 0;
  v_profit_margin   numeric := 0;
  v_subtotal        numeric;
  v_tax             numeric;
  v_discount        numeric;
  v_total           numeric;
  v_delivery_charge numeric;
  v_sale_date       timestamptz;
  v_cash_account_id    uuid;
  v_ar_account_id      uuid;
  v_revenue_account_id uuid;
  v_cogs_account_id    uuid;
  v_inv_account_id     uuid;
  v_vat_account_id     uuid;
  v_je_id              uuid;
  v_je_number          text;
  v_debit_account_id   uuid;
  v_register_id        uuid;
  v_tx_number          text;
  v_salesperson_id     uuid;
  v_emp_commission_rate numeric;
  v_idempotency_key    text;
  v_existing_sale_id   uuid;
  v_unit_price         numeric;
  v_item_discount      numeric;
  v_item_total         numeric;
  v_purchase_price     numeric;
  v_item_cost          numeric;
  v_is_service         boolean;
BEGIN
  v_sale_id        := COALESCE((p_payload->>'id')::uuid, gen_random_uuid());
  v_branch_id      := (p_payload->>'branch_id')::uuid;
  v_created_by     := (p_payload->>'created_by')::uuid;
  v_payment_method := COALESCE(p_payload->>'payment_method', 'cash');
  v_items          := p_payload->'items';
  v_subtotal       := COALESCE((p_payload->>'subtotal')::numeric, 0);
  v_tax            := COALESCE((p_payload->>'tax')::numeric, 0);
  v_discount       := COALESCE((p_payload->>'discount')::numeric, 0);
  v_total          := COALESCE((p_payload->>'total')::numeric, 0);
  v_delivery_charge:= COALESCE((p_payload->>'delivery_charge')::numeric, 0);
  v_sale_date      := COALESCE((p_payload->>'sale_date')::timestamptz, now());
  v_salesperson_id := NULLIF(p_payload->>'salesperson_id', '')::uuid;
  v_idempotency_key:= NULLIF(p_payload->>'idempotency_key', '');

  -- Idempotency check
  IF v_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_sale_id
    FROM sales
    WHERE idempotency_key = v_idempotency_key
    LIMIT 1;

    IF v_existing_sale_id IS NOT NULL THEN
      SELECT sale_number INTO v_sale_number FROM sales WHERE id = v_existing_sale_id;
      RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_existing_sale_id,
        'sale_number', v_sale_number,
        'status', 'confirmed',
        'duplicate', true
      );
    END IF;
  END IF;

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_id is required';
  END IF;

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'At least one item is required';
  END IF;

  PERFORM set_config('app.bypass_immutable', 'true', true);
  PERFORM set_config('app.atomic_sale_in_progress', 'true', true);

  -- STEP 1: Stock validation
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty        := COALESCE((v_item->>'quantity')::numeric, 0);

    IF EXISTS (SELECT 1 FROM products WHERE id = v_product_id AND type = 'services') THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(quantity_on_hand, 0)
    INTO v_stock_qty
    FROM product_costing
    WHERE product_id = v_product_id AND branch_id = v_branch_id;

    IF v_stock_qty IS NULL THEN v_stock_qty := 0; END IF;

    IF v_stock_qty < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for product % (available: %, requested: %)',
        v_product_id, v_stock_qty, v_qty;
    END IF;
  END LOOP;

  -- STEP 2: Generate sale number
  SELECT 'INV-' || TO_CHAR(now(), 'YYYYMMDD') || '-' ||
    LPAD((
      SELECT COUNT(*) + 1
      FROM sales
      WHERE sale_date::date = now()::date
        AND branch_id = v_branch_id
    )::text, 4, '0')
  INTO v_sale_number;

  -- STEP 3: Insert sale
  INSERT INTO sales (
    id, branch_id, sale_number,
    customer_id, customer_name, customer_phone,
    sale_date, status,
    subtotal, tax, discount, total,
    paid_amount, payment_status, payment_method,
    delivery_charge, delivery_address, card_message,
    notes, source,
    salla_shipping_cost, salla_payment_gateway_fee,
    buyer_type, company_name, company_vat_number, company_address,
    salesperson_id, created_by, created_at, updated_at,
    idempotency_key
  ) VALUES (
    v_sale_id, v_branch_id, v_sale_number,
    NULLIF(p_payload->>'customer_id', '')::uuid,
    NULLIF(p_payload->>'customer_name', ''),
    NULLIF(p_payload->>'customer_phone', ''),
    v_sale_date, 'confirmed',
    v_subtotal, v_tax, v_discount, v_total,
    CASE WHEN p_payload->>'payment_status' = 'unpaid' THEN 0 ELSE v_total END,
    COALESCE(p_payload->>'payment_status', 'paid'),
    v_payment_method,
    v_delivery_charge,
    NULLIF(p_payload->>'delivery_address', ''),
    NULLIF(p_payload->>'card_message', ''),
    NULLIF(p_payload->>'notes', ''),
    COALESCE(p_payload->>'source', 'store'),
    COALESCE((p_payload->>'salla_shipping_cost')::numeric, 0),
    COALESCE((p_payload->>'salla_payment_gateway_fee')::numeric, 0),
    COALESCE(p_payload->>'buyer_type', 'individual'),
    NULLIF(p_payload->>'company_name', ''),
    NULLIF(p_payload->>'company_vat_number', ''),
    NULLIF(p_payload->>'company_address', ''),
    v_salesperson_id, v_created_by, now(), now(),
    v_idempotency_key
  );

  -- STEP 4: Insert sale items + deduct stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_product_id    := (v_item->>'product_id')::uuid;
    v_qty           := COALESCE((v_item->>'quantity')::numeric, 0);
    v_unit_price    := COALESCE((v_item->>'unit_price')::numeric, 0);
    v_item_discount := COALESCE((v_item->>'discount')::numeric, 0);
    v_item_total    := COALESCE((v_item->>'total')::numeric, 0);
    v_purchase_price := 0;
    v_is_service    := false;

    SELECT COALESCE(purchase_price, 0), type = 'services'
    INTO v_purchase_price, v_is_service
    FROM products WHERE id = v_product_id;

    INSERT INTO sale_items (
      id, sale_id, product_id, quantity,
      unit_price, purchase_price, discount, total,
      created_at
    ) VALUES (
      gen_random_uuid(), v_sale_id, v_product_id, v_qty,
      v_unit_price, v_purchase_price, v_item_discount, v_item_total,
      now()
    );

    IF NOT v_is_service THEN
      UPDATE product_costing
      SET quantity_on_hand = quantity_on_hand - v_qty,
          updated_at = now()
      WHERE product_id = v_product_id AND branch_id = v_branch_id;

      UPDATE inventory
      SET quantity = quantity - v_qty,
          updated_at = now()
      WHERE product_id = v_product_id AND branch_id = v_branch_id;

      INSERT INTO inventory_movements (
        id, product_id, branch_id, movement_type,
        quantity, reference_id, reference_type,
        unit_cost, notes, created_by, created_at
      ) VALUES (
        gen_random_uuid(), v_product_id, v_branch_id, 'out',
        v_qty, v_sale_id, 'sale',
        v_purchase_price, 'Sale: ' || v_sale_number,
        v_created_by, now()
      )
      ON CONFLICT DO NOTHING;

      v_item_cost  := v_qty * v_purchase_price;
      v_total_cost := v_total_cost + v_item_cost;
    END IF;
  END LOOP;

  -- STEP 5: Gross profit
  v_gross_profit := v_subtotal - v_total_cost;
  IF v_subtotal > 0 THEN
    v_profit_margin := ROUND((v_gross_profit / v_subtotal) * 100, 2);
  END IF;

  UPDATE sales SET
    total_cost    = v_total_cost,
    gross_profit  = v_gross_profit,
    profit_margin = v_profit_margin,
    updated_at    = now()
  WHERE id = v_sale_id;

  -- STEP 6: GL Journal Entry
  SELECT id INTO v_cash_account_id    FROM accounts WHERE code = '1110' LIMIT 1;
  SELECT id INTO v_ar_account_id      FROM accounts WHERE code = '1120' LIMIT 1;
  SELECT id INTO v_revenue_account_id FROM accounts WHERE code = '4100' LIMIT 1;
  SELECT id INTO v_cogs_account_id    FROM accounts WHERE code = '5100' LIMIT 1;
  SELECT id INTO v_inv_account_id     FROM accounts WHERE code = '1130' LIMIT 1;
  SELECT id INTO v_vat_account_id     FROM accounts WHERE code = '2130' LIMIT 1;

  IF v_cash_account_id IS NOT NULL AND v_revenue_account_id IS NOT NULL THEN
    v_je_id     := gen_random_uuid();
    v_je_number := 'JE-SALE-' || TO_CHAR(now(), 'YYYYMMDD') || '-' ||
                   SUBSTRING(v_sale_id::text, 1, 8);

    v_debit_account_id := CASE
      WHEN v_payment_method IN ('cash', 'card', 'bank_transfer') THEN v_cash_account_id
      ELSE COALESCE(v_ar_account_id, v_cash_account_id)
    END;

    INSERT INTO journal_entries (
      id, entry_number, entry_date, description,
      branch_id, reference_id, reference_type,
      status, created_by, created_at, updated_at
    ) VALUES (
      v_je_id, v_je_number, v_sale_date::date,
      'Sale: ' || v_sale_number,
      v_branch_id, v_sale_id, 'sale',
      'posted', v_created_by, now(), now()
    );

    INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description, created_at)
    VALUES
      (gen_random_uuid(), v_je_id, v_debit_account_id, v_total, 0, 'Cash/AR: ' || v_sale_number, now()),
      (gen_random_uuid(), v_je_id, v_revenue_account_id, 0, v_subtotal, 'Revenue: ' || v_sale_number, now());

    IF v_tax > 0 AND v_vat_account_id IS NOT NULL THEN
      INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description, created_at)
      VALUES (gen_random_uuid(), v_je_id, v_vat_account_id, 0, v_tax, 'VAT Output: ' || v_sale_number, now());
    END IF;

    IF v_total_cost > 0 AND v_cogs_account_id IS NOT NULL AND v_inv_account_id IS NOT NULL THEN
      INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description, created_at)
      VALUES
        (gen_random_uuid(), v_je_id, v_cogs_account_id, v_total_cost, 0, 'COGS: ' || v_sale_number, now()),
        (gen_random_uuid(), v_je_id, v_inv_account_id, 0, v_total_cost, 'Inv OUT: ' || v_sale_number, now());
    END IF;
  END IF;

  -- STEP 7: Cash register movement
  IF v_payment_method = 'cash' THEN
    SELECT id INTO v_register_id
    FROM cash_registers
    WHERE branch_id = v_branch_id AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1;

    IF v_register_id IS NOT NULL THEN
      v_tx_number := 'CT-' || TO_CHAR(now(), 'YYYYMMDDHHMI') || '-' || SUBSTRING(v_sale_id::text, 1, 6);

      INSERT INTO cash_transactions (
        id, register_id, branch_id, transaction_type,
        amount, description, reference_id, reference_type,
        transaction_number, created_by, created_at
      ) VALUES (
        gen_random_uuid(), v_register_id, v_branch_id, 'sale_in',
        v_total, 'Sale: ' || v_sale_number, v_sale_id, 'sale',
        v_tx_number, v_created_by, now()
      );

      UPDATE cash_registers
      SET current_balance = current_balance + v_total,
          updated_at = now()
      WHERE id = v_register_id;
    END IF;
  END IF;

  -- STEP 8: Commission
  IF v_salesperson_id IS NOT NULL THEN
    SELECT COALESCE(commission_rate, 0)
    INTO v_emp_commission_rate
    FROM employees
    WHERE id = v_salesperson_id AND is_active = true;

    IF COALESCE(v_emp_commission_rate, 0) > 0 THEN
      INSERT INTO employee_commissions (
        id, employee_id, branch_id, sale_id,
        commission_rate, commission_amount,
        sale_amount, is_paid, status,
        period_month, period_year,
        created_at
      ) VALUES (
        gen_random_uuid(), v_salesperson_id, v_branch_id, v_sale_id,
        v_emp_commission_rate,
        ROUND(v_subtotal * (v_emp_commission_rate / 100), 2),
        v_subtotal, false, 'pending',
        EXTRACT(MONTH FROM now())::int,
        EXTRACT(YEAR FROM now())::int,
        now()
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- STEP 9: Customer metrics
  IF (p_payload->>'customer_id') IS NOT NULL AND (p_payload->>'customer_id') != '' THEN
    UPDATE customers SET
      total_spent     = COALESCE(total_spent, 0) + v_total,
      order_count     = COALESCE(order_count, 0) + 1,
      last_order_date = v_sale_date::date,
      updated_at      = now()
    WHERE id = (p_payload->>'customer_id')::uuid;
  END IF;

  PERFORM set_config('app.bypass_immutable', 'false', true);
  PERFORM set_config('app.atomic_sale_in_progress', 'false', true);

  RETURN jsonb_build_object(
    'success',      true,
    'sale_id',      v_sale_id,
    'sale_number',  v_sale_number,
    'status',       'confirmed',
    'total_cost',   v_total_cost,
    'gross_profit', v_gross_profit,
    'profit_margin',v_profit_margin,
    'duplicate',    false
  );

EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.bypass_immutable', 'false', true);
  PERFORM set_config('app.atomic_sale_in_progress', 'false', true);
  RAISE;
END;
$$;

-- ============================================================
-- 3. BLOCK direct INSERT on sales table (authenticated users)
-- ============================================================
DO $$
DECLARE pol_name text;
BEGIN
  FOR pol_name IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'sales' AND cmd = 'INSERT'
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || pol_name || '" ON sales';
  END LOOP;
END $$;

-- Authenticated users cannot insert directly — use create_sale_atomic RPC (SECURITY DEFINER)
CREATE POLICY "block direct sales insert"
  ON sales FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- ============================================================
-- 4. GRANT execute on create_sale_atomic to authenticated
-- ============================================================
GRANT EXECUTE ON FUNCTION create_sale_atomic(jsonb) TO authenticated;
