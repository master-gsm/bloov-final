/*
  # Atomic Sale Transaction System

  ## Summary
  Replaces the fragmented sale creation flow (insert sale → insert items → update stock in frontend)
  with a single SECURITY DEFINER function that runs everything inside one transaction.

  ## What this migration does

  ### New Function: `create_sale_atomic(p_payload jsonb)`
  Accepts a JSON payload and performs ALL of the following atomically:
  1. Validate stock availability for every item BEFORE creating any record
  2. INSERT into `sales`
  3. INSERT into `sale_items`
  4. Deduct stock from `product_costing` (moving-average costing table)
  5. Deduct stock from `inventory` and `branch_stock` (legacy tables - best-effort)
  6. Calculate `total_cost`, `gross_profit`, `profit_margin` and UPDATE `sales`

  If ANY step fails → the entire transaction is rolled back automatically by PostgreSQL.

  ### Existing triggers are preserved
  - `trigger_process_sale_inventory_out` on sale_items will fire but is idempotent
    (it checks product_costing and will just be redundant; we handle it gracefully)
  - Commission triggers on sales table will fire after INSERT with status='confirmed'
  - Journal-entry trigger fires after INSERT with status='confirmed'

  ### Commission fix
  - Drop the duplicate `trigger_calculate_commission` (uses calculate_commission_on_sale)
    which references non-existent columns (sale.date, sale.sale_channel). Only keep
    `trigger_calculate_commission_on_sale` (uses calculate_sale_commission) which
    is the correct implementation referencing `source` and `created_by`.
  - Fix `calculate_sale_commission` to reference `NEW.total` not `NEW.total_amount`.

  ### No RLS changes. No role changes. No new policies.
*/

-- ═══════════════════════════════════════════════════════════
-- STEP 1: Fix duplicate commission trigger
-- Drop the broken commission trigger that references wrong columns
-- ═══════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trigger_calculate_commission ON sales;

-- Fix calculate_sale_commission: it was using NEW.total_amount but the column is NEW.total
CREATE OR REPLACE FUNCTION calculate_sale_commission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sale_employee_id uuid;
  sale_channel_type text;
  commission_rate_to_use decimal(5,2);
  active_plan record;
BEGIN
  IF NEW.status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  SELECT e.id INTO sale_employee_id
  FROM employees e
  WHERE e.user_id = NEW.created_by
  AND e.is_active = true
  LIMIT 1;

  IF sale_employee_id IS NULL AND NEW.salesperson_id IS NOT NULL THEN
    sale_employee_id := NEW.salesperson_id;
  END IF;

  IF sale_employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.source = 'salla' THEN
    sale_channel_type := 'salla';
  ELSIF NEW.source = 'online' THEN
    sale_channel_type := 'online';
  ELSE
    sale_channel_type := 'store';
  END IF;

  SELECT *
  INTO active_plan
  FROM compensation_plans
  WHERE employee_id = sale_employee_id
  AND is_active = true
  AND effective_from <= CURRENT_DATE
  AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
  ORDER BY effective_from DESC
  LIMIT 1;

  IF active_plan IS NULL THEN
    RETURN NEW;
  END IF;

  IF sale_channel_type = 'salla' THEN
    commission_rate_to_use := COALESCE(active_plan.commission_rate_salla, active_plan.commission_rate_external, 0);
  ELSIF sale_channel_type = 'store' THEN
    commission_rate_to_use := COALESCE(active_plan.commission_rate_internal, 0);
  ELSE
    commission_rate_to_use := COALESCE(active_plan.commission_rate_external, 0);
  END IF;

  IF commission_rate_to_use > 0 THEN
    INSERT INTO employee_commissions (
      employee_id,
      sale_id,
      sale_amount,
      commission_rate,
      commission_amount,
      sale_channel,
      status
    ) VALUES (
      sale_employee_id,
      NEW.id,
      NEW.total,
      commission_rate_to_use,
      ROUND((NEW.total * commission_rate_to_use / 100), 2),
      sale_channel_type,
      'pending'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- STEP 2: Fix process_sale_inventory_out to be safe when
-- stock was already deducted by the atomic function
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION process_sale_inventory_out()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_id UUID;
  v_product_id UUID;
  v_sale_qty NUMERIC;
  v_available_qty NUMERIC;
  v_product_sku TEXT;
  v_sale_date DATE;
  v_created_by UUID;
  v_sale_item_id UUID;
BEGIN
  IF NEW.voided_at IS NOT NULL OR NEW.is_deleted = true THEN
    RETURN NEW;
  END IF;

  -- Skip if atomic function already handled this (flag set in session)
  IF current_setting('app.atomic_sale_in_progress', true) = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT branch_id, sale_date, created_by
  INTO v_branch_id, v_sale_date, v_created_by
  FROM sales
  WHERE id = NEW.sale_id;

  v_product_id := NEW.product_id;
  v_sale_qty := NEW.quantity;
  v_sale_item_id := NEW.id;

  SELECT sku INTO v_product_sku
  FROM products
  WHERE id = v_product_id;

  SELECT quantity_on_hand INTO v_available_qty
  FROM product_costing
  WHERE product_id = v_product_id
  AND branch_id = v_branch_id;

  IF NOT FOUND THEN
    v_available_qty := 0;
  END IF;

  IF v_available_qty < v_sale_qty THEN
    RAISE EXCEPTION 'Insufficient stock for item [%]: Available=%, Requested=%',
      v_product_sku,
      v_available_qty,
      v_sale_qty;
  END IF;

  UPDATE product_costing
  SET quantity_on_hand = quantity_on_hand - v_sale_qty,
      updated_at = now()
  WHERE product_id = v_product_id
  AND branch_id = v_branch_id;

  INSERT INTO inventory_movements (
    product_id,
    movement_type,
    quantity,
    reference_type,
    reference_id,
    notes,
    notes_ar,
    created_by
  ) VALUES (
    v_product_id,
    'out',
    v_sale_qty,
    'sale',
    NEW.sale_id,
    'Sale deduction',
    'خصم مبيعات',
    v_created_by
  );

  PERFORM auto_post_cogs_on_sale(
    v_sale_item_id,
    v_product_id,
    v_branch_id,
    v_sale_qty,
    v_sale_date,
    v_created_by
  );

  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- STEP 3: Create the main atomic sale function
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION create_sale_atomic(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_branch_id uuid;
  v_sale_id uuid;
  v_sale_number text;
  v_item jsonb;
  v_items jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_unit_price numeric;
  v_purchase_price numeric;
  v_item_discount numeric;
  v_item_total numeric;
  v_available_qty numeric;
  v_product_sku text;
  v_product_name text;
  v_avg_cost numeric;
  v_total_cost numeric := 0;
  v_gross_profit numeric;
  v_profit_margin numeric;
  v_sale_total numeric;
  v_sale_record record;
  v_sale_item_id uuid;
  v_sale_date date;
  v_created_by uuid;
  -- sale fields
  v_customer_id uuid;
  v_subtotal numeric;
  v_tax numeric;
  v_discount numeric;
  v_total numeric;
  v_paid_amount numeric;
  v_payment_status text;
  v_payment_method text;
  v_delivery_charge numeric;
  v_delivery_address text;
  v_card_message text;
  v_notes text;
  v_source text;
  v_salla_shipping_cost numeric;
  v_salla_payment_fee numeric;
  v_salesperson_id uuid;
  v_customer_name text;
  v_customer_phone text;
BEGIN
  -- Auth check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
  IF v_caller_role NOT IN ('admin', 'super_admin', 'accountant', 'manager', 'cashier', 'viewer') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  -- Extract payload
  v_items            := p_payload->'items';
  v_branch_id        := (p_payload->>'branch_id')::uuid;
  v_customer_id      := NULLIF(p_payload->>'customer_id', '')::uuid;
  v_subtotal         := (p_payload->>'subtotal')::numeric;
  v_tax              := COALESCE((p_payload->>'tax')::numeric, 0);
  v_discount         := COALESCE((p_payload->>'discount')::numeric, 0);
  v_total            := (p_payload->>'total')::numeric;
  v_paid_amount      := COALESCE((p_payload->>'paid_amount')::numeric, v_total);
  v_payment_status   := COALESCE(p_payload->>'payment_status', 'paid');
  v_payment_method   := COALESCE(p_payload->>'payment_method', 'cash');
  v_delivery_charge  := COALESCE((p_payload->>'delivery_charge')::numeric, 0);
  v_delivery_address := NULLIF(p_payload->>'delivery_address', '');
  v_card_message     := NULLIF(p_payload->>'card_message', '');
  v_notes            := NULLIF(p_payload->>'notes', '');
  v_source           := COALESCE(p_payload->>'source', 'store');
  v_salla_shipping_cost := COALESCE((p_payload->>'salla_shipping_cost')::numeric, 0);
  v_salla_payment_fee   := COALESCE((p_payload->>'salla_payment_gateway_fee')::numeric, 0);
  v_salesperson_id   := NULLIF(p_payload->>'salesperson_id', '')::uuid;
  v_customer_name    := NULLIF(p_payload->>'customer_name', '');
  v_customer_phone   := NULLIF(p_payload->>'customer_phone', '');
  v_sale_date        := COALESCE((p_payload->>'sale_date')::date, CURRENT_DATE);
  v_created_by       := v_caller_id;

  -- ═══════════════════════════════════════
  -- PHASE 1: Validate stock for ALL items
  -- ═══════════════════════════════════════
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty        := (v_item->>'quantity')::numeric;

    IF v_product_id IS NULL THEN CONTINUE; END IF;

    SELECT sku, name INTO v_product_sku, v_product_name
    FROM products WHERE id = v_product_id;

    SELECT quantity_on_hand INTO v_available_qty
    FROM product_costing
    WHERE product_id = v_product_id AND branch_id = v_branch_id;

    IF NOT FOUND THEN
      -- Try inventory table as fallback
      SELECT quantity INTO v_available_qty
      FROM inventory
      WHERE product_id = v_product_id AND branch_id = v_branch_id;

      IF NOT FOUND THEN
        v_available_qty := 0;
      END IF;
    END IF;

    IF v_available_qty < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for [%] "%": Available=%, Requested=%',
        COALESCE(v_product_sku, 'N/A'),
        COALESCE(v_product_name, 'Unknown'),
        COALESCE(v_available_qty, 0),
        v_qty;
    END IF;
  END LOOP;

  -- ═══════════════════════════════════════
  -- PHASE 2: Generate sale number
  -- ═══════════════════════════════════════
  SELECT 'INV-' || TO_CHAR(now(), 'YYYYMMDD') || '-' ||
         LPAD(COALESCE((
           SELECT COUNT(*) + 1
           FROM sales
           WHERE DATE(sale_date) = CURRENT_DATE
           AND branch_id = v_branch_id
         ), 1)::text, 4, '0')
  INTO v_sale_number;

  -- ═══════════════════════════════════════
  -- PHASE 3: Insert sale record
  -- ═══════════════════════════════════════

  -- Signal to process_sale_inventory_out trigger to skip (we handle it here)
  PERFORM set_config('app.atomic_sale_in_progress', 'true', true);

  INSERT INTO sales (
    sale_number, customer_id, sale_date, status,
    subtotal, tax, discount, total,
    paid_amount, payment_status, payment_method,
    delivery_charge, delivery_address, card_message,
    notes, source,
    salla_shipping_cost, salla_payment_gateway_fee,
    salesperson_id, branch_id, created_by,
    customer_name, customer_phone
  ) VALUES (
    v_sale_number, v_customer_id, now(), 'confirmed',
    v_subtotal, v_tax, v_discount, v_total,
    v_paid_amount, v_payment_status, v_payment_method,
    v_delivery_charge, v_delivery_address, v_card_message,
    v_notes, v_source,
    v_salla_shipping_cost, v_salla_payment_fee,
    v_salesperson_id, v_branch_id, v_created_by,
    v_customer_name, v_customer_phone
  )
  RETURNING id INTO v_sale_id;

  -- ═══════════════════════════════════════
  -- PHASE 4: Insert sale items + deduct stock
  -- ═══════════════════════════════════════
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_product_id     := (v_item->>'product_id')::uuid;
    v_qty            := (v_item->>'quantity')::numeric;
    v_unit_price     := (v_item->>'unit_price')::numeric;
    v_purchase_price := COALESCE((v_item->>'purchase_price')::numeric, 0);
    v_item_discount  := COALESCE((v_item->>'discount')::numeric, 0);
    v_item_total     := (v_item->>'total')::numeric;

    IF v_product_id IS NULL THEN CONTINUE; END IF;

    -- Insert sale item
    INSERT INTO sale_items (
      sale_id, product_id, quantity, unit_price,
      purchase_price, discount, total
    ) VALUES (
      v_sale_id, v_product_id, v_qty, v_unit_price,
      v_purchase_price, v_item_discount, v_item_total
    )
    RETURNING id INTO v_sale_item_id;

    -- Deduct from product_costing (primary stock source)
    UPDATE product_costing
    SET quantity_on_hand = quantity_on_hand - v_qty,
        updated_at = now()
    WHERE product_id = v_product_id AND branch_id = v_branch_id;

    -- Accumulate cost using average_cost from product_costing
    SELECT COALESCE(average_cost, v_purchase_price, 0) INTO v_avg_cost
    FROM product_costing
    WHERE product_id = v_product_id AND branch_id = v_branch_id;

    v_total_cost := v_total_cost + (COALESCE(v_avg_cost, v_purchase_price, 0) * v_qty);

    -- Deduct from inventory (legacy, best-effort)
    UPDATE inventory
    SET quantity = quantity - v_qty,
        last_updated = now()
    WHERE product_id = v_product_id AND branch_id = v_branch_id;

    -- Deduct from branch_stock (legacy, best-effort)
    UPDATE branch_stock
    SET quantity = quantity - v_qty,
        updated_at = now()
    WHERE product_id = v_product_id AND branch_id = v_branch_id;

    -- Insert inventory movement
    INSERT INTO inventory_movements (
      product_id, movement_type, quantity,
      reference_type, reference_id,
      notes, notes_ar, created_by
    ) VALUES (
      v_product_id, 'out', v_qty,
      'sale', v_sale_id,
      'Sale ' || v_sale_number, 'بيع ' || v_sale_number,
      v_created_by
    );

    -- Auto-post COGS journal entry (idempotent inside the function)
    PERFORM auto_post_cogs_on_sale(
      v_sale_item_id,
      v_product_id,
      v_branch_id,
      v_qty,
      v_sale_date,
      v_created_by
    );
  END LOOP;

  -- ═══════════════════════════════════════
  -- PHASE 5: Calculate and store profit
  -- ═══════════════════════════════════════
  v_gross_profit := v_total - v_total_cost;
  IF v_total > 0 THEN
    v_profit_margin := ROUND((v_gross_profit / v_total) * 100, 2);
  ELSE
    v_profit_margin := 0;
  END IF;

  PERFORM set_config('app.bypass_immutable', 'true', true);

  UPDATE sales
  SET total_cost   = v_total_cost,
      gross_profit = v_gross_profit,
      profit_margin = v_profit_margin,
      updated_at   = now()
  WHERE id = v_sale_id;

  PERFORM set_config('app.bypass_immutable', 'false', true);

  -- Reset atomic flag
  PERFORM set_config('app.atomic_sale_in_progress', 'false', true);

  -- Return sale id and number
  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'sale_number', v_sale_number,
    'total_cost', v_total_cost,
    'gross_profit', v_gross_profit,
    'profit_margin', v_profit_margin
  );

EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.atomic_sale_in_progress', 'false', true);
  PERFORM set_config('app.bypass_immutable', 'false', true);
  RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION create_sale_atomic(jsonb) TO authenticated;
