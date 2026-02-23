
/*
  # Allocation Engine — Migration 3: Allocation Functions

  ## Summary
  Two atomic allocation functions, one for AR (customer payments) and one for AP
  (supplier payments). Each function:
  - Runs all allocations inside a single transaction.
  - Validates the payment exists and is not deleted.
  - Validates each invoice/purchase before inserting.
  - Enforces branch isolation.
  - Prevents double allocation (checks for existing live allocation rows).
  - Auto-updates invoice/purchase payment_status after allocation.

  ## New Functions

  ### `allocate_customer_payment(p_payment_id, p_allocations)`
  `p_allocations` format: `[{"invoice_id": "uuid", "amount": 400.00}, ...]`
  Returns: jsonb with allocated rows and updated statuses.

  ### `allocate_supplier_payment(p_payment_id, p_allocations)`
  `p_allocations` format: `[{"purchase_id": "uuid", "amount": 400.00}, ...]`
  Returns: jsonb with allocated rows and updated statuses.

  ## Invoice Status Auto-Update Logic (AR)
  After each allocation:
  - If SUM(allocated) >= invoice.total → status = 'paid'
  - Else if SUM(allocated) > 0 → status remains 'sent'/'overdue' (partially paid)

  ## Purchase Payment Status Auto-Update (AP)
  After each allocation:
  - If SUM(allocated) >= purchase.total → payment_status = 'paid'
  - Else if SUM(allocated) > 0 → payment_status = 'partial'
*/

-- ═══════════════════════════════════════════════════════════════════
-- Helper: update invoice status after allocation change
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION _refresh_invoice_payment_status(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total     numeric;
  v_allocated numeric;
  v_status    text;
BEGIN
  SELECT total, COALESCE(paid_amount, 0), status
  INTO v_total, v_allocated, v_status
  FROM invoices WHERE id = p_invoice_id;

  SELECT COALESCE(SUM(allocated_amount), 0)
  INTO v_allocated
  FROM invoice_payments
  WHERE invoice_id = p_invoice_id AND is_deleted = false;

  -- Update paid_amount and status
  UPDATE invoices
  SET
    paid_amount = v_allocated,
    status = CASE
      WHEN v_allocated >= v_total THEN 'paid'
      WHEN v_allocated > 0 AND status NOT IN ('cancelled') THEN status  -- preserve sent/overdue
      ELSE status
    END,
    updated_at = now()
  WHERE id = p_invoice_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- Helper: update purchase payment_status after allocation change
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION _refresh_purchase_payment_status(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total     numeric;
  v_allocated numeric;
BEGIN
  SELECT total INTO v_total FROM purchases WHERE id = p_purchase_id;

  SELECT COALESCE(SUM(allocated_amount), 0)
  INTO v_allocated
  FROM purchase_payments
  WHERE purchase_id = p_purchase_id AND is_deleted = false;

  UPDATE purchases
  SET
    paid_amount    = v_allocated,
    payment_status = CASE
      WHEN v_allocated >= v_total THEN 'paid'
      WHEN v_allocated > 0        THEN 'partial'
      ELSE 'unpaid'
    END,
    updated_at = now()
  WHERE id = p_purchase_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- AR: allocate_customer_payment()
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION allocate_customer_payment(
  p_payment_id  uuid,
  p_allocations jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment       customer_payments%ROWTYPE;
  v_user_id       uuid;
  v_item          jsonb;
  v_invoice_id    uuid;
  v_amount        numeric;
  v_total_alloc   numeric := 0;
  v_inserted_ids  uuid[]  := '{}';
  v_new_id        uuid;
  v_results       jsonb[] := '{}';
BEGIN
  v_user_id := COALESCE(
    auth.uid(),
    (SELECT id FROM users WHERE role IN ('admin','super_admin') ORDER BY created_at LIMIT 1)
  );

  -- Fetch and validate payment
  SELECT * INTO v_payment
  FROM customer_payments
  WHERE id = p_payment_id AND is_deleted IS NOT TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer payment % not found or deleted.', p_payment_id;
  END IF;

  -- Validate allocations array
  IF p_allocations IS NULL OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'allocations array is empty.';
  END IF;

  -- Process each allocation item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_invoice_id := (v_item->>'invoice_id')::uuid;
    v_amount     := (v_item->>'amount')::numeric;

    IF v_invoice_id IS NULL OR v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Each allocation must have a valid invoice_id and amount > 0. Got: %', v_item;
    END IF;

    -- Guard: no double allocation for same invoice+payment pair
    IF EXISTS (
      SELECT 1 FROM invoice_payments
      WHERE invoice_id = v_invoice_id
        AND payment_id = p_payment_id
        AND is_deleted = false
    ) THEN
      RAISE EXCEPTION
        'Double allocation blocked: payment % is already allocated to invoice %.',
        p_payment_id, v_invoice_id;
    END IF;

    v_total_alloc := v_total_alloc + v_amount;

    -- Insert (trigger guard_invoice_payment_allocation fires here)
    INSERT INTO invoice_payments (
      invoice_id, payment_id, allocated_amount,
      allocation_date, branch_id, created_by
    ) VALUES (
      v_invoice_id, p_payment_id, v_amount,
      CURRENT_DATE,
      COALESCE(v_payment.branch_id, (SELECT branch_id FROM invoices WHERE id = v_invoice_id)),
      v_user_id
    ) RETURNING id INTO v_new_id;

    v_inserted_ids := array_append(v_inserted_ids, v_new_id);

    -- Refresh invoice status
    PERFORM _refresh_invoice_payment_status(v_invoice_id);

    v_results := array_append(v_results, jsonb_build_object(
      'allocation_id', v_new_id,
      'invoice_id',    v_invoice_id,
      'amount',        v_amount
    ));
  END LOOP;

  -- Final payment-level guard (belt-and-suspenders, trigger handles per-row)
  IF v_total_alloc > v_payment.amount THEN
    RAISE EXCEPTION
      'Total allocation % exceeds payment amount %.', v_total_alloc, v_payment.amount;
  END IF;

  RETURN jsonb_build_object(
    'payment_id',      p_payment_id,
    'payment_amount',  v_payment.amount,
    'total_allocated', v_total_alloc,
    'remaining',       v_payment.amount - v_total_alloc,
    'allocations',     to_jsonb(v_results)
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- AP: allocate_supplier_payment()
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION allocate_supplier_payment(
  p_payment_id  uuid,
  p_allocations jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment       supplier_payments%ROWTYPE;
  v_user_id       uuid;
  v_item          jsonb;
  v_purchase_id   uuid;
  v_amount        numeric;
  v_total_alloc   numeric := 0;
  v_new_id        uuid;
  v_results       jsonb[] := '{}';
BEGIN
  v_user_id := COALESCE(
    auth.uid(),
    (SELECT id FROM users WHERE role IN ('admin','super_admin') ORDER BY created_at LIMIT 1)
  );

  -- Fetch and validate payment
  SELECT * INTO v_payment
  FROM supplier_payments
  WHERE id = p_payment_id AND is_deleted IS NOT TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supplier payment % not found or deleted.', p_payment_id;
  END IF;

  IF p_allocations IS NULL OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'allocations array is empty.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_purchase_id := (v_item->>'purchase_id')::uuid;
    v_amount      := (v_item->>'amount')::numeric;

    IF v_purchase_id IS NULL OR v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Each allocation must have a valid purchase_id and amount > 0. Got: %', v_item;
    END IF;

    -- Guard: no double allocation
    IF EXISTS (
      SELECT 1 FROM purchase_payments
      WHERE purchase_id = v_purchase_id
        AND payment_id  = p_payment_id
        AND is_deleted  = false
    ) THEN
      RAISE EXCEPTION
        'Double allocation blocked: payment % is already allocated to purchase %.',
        p_payment_id, v_purchase_id;
    END IF;

    v_total_alloc := v_total_alloc + v_amount;

    -- Insert (trigger guard_purchase_payment_allocation fires here)
    INSERT INTO purchase_payments (
      purchase_id, payment_id, allocated_amount,
      allocation_date, branch_id, created_by
    ) VALUES (
      v_purchase_id, p_payment_id, v_amount,
      CURRENT_DATE,
      COALESCE(
        v_payment.branch_id,
        (SELECT branch_id FROM purchases WHERE id = v_purchase_id)
      ),
      v_user_id
    ) RETURNING id INTO v_new_id;

    -- Refresh purchase payment status
    PERFORM _refresh_purchase_payment_status(v_purchase_id);

    v_results := array_append(v_results, jsonb_build_object(
      'allocation_id', v_new_id,
      'purchase_id',   v_purchase_id,
      'amount',        v_amount
    ));
  END LOOP;

  IF v_total_alloc > v_payment.amount THEN
    RAISE EXCEPTION
      'Total allocation % exceeds payment amount %.', v_total_alloc, v_payment.amount;
  END IF;

  RETURN jsonb_build_object(
    'payment_id',      p_payment_id,
    'payment_amount',  v_payment.amount,
    'total_allocated', v_total_alloc,
    'remaining',       v_payment.amount - v_total_alloc,
    'allocations',     to_jsonb(v_results)
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- Void allocation helpers
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION void_invoice_payment(p_allocation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv_id uuid;
  v_user_id uuid;
BEGIN
  v_user_id := COALESCE(
    auth.uid(),
    (SELECT id FROM users WHERE role IN ('admin','super_admin') ORDER BY created_at LIMIT 1)
  );

  SELECT invoice_id INTO v_inv_id
  FROM invoice_payments WHERE id = p_allocation_id AND is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation % not found or already voided.', p_allocation_id;
  END IF;

  UPDATE invoice_payments
  SET is_deleted = true, voided_at = now(), voided_by = v_user_id
  WHERE id = p_allocation_id;

  PERFORM _refresh_invoice_payment_status(v_inv_id);
END;
$$;

CREATE OR REPLACE FUNCTION void_purchase_payment(p_allocation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pur_id  uuid;
  v_user_id uuid;
BEGIN
  v_user_id := COALESCE(
    auth.uid(),
    (SELECT id FROM users WHERE role IN ('admin','super_admin') ORDER BY created_at LIMIT 1)
  );

  SELECT purchase_id INTO v_pur_id
  FROM purchase_payments WHERE id = p_allocation_id AND is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation % not found or already voided.', p_allocation_id;
  END IF;

  UPDATE purchase_payments
  SET is_deleted = true, voided_at = now(), voided_by = v_user_id
  WHERE id = p_allocation_id;

  PERFORM _refresh_purchase_payment_status(v_pur_id);
END;
$$;
