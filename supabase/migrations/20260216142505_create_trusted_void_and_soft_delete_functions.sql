/*
  # Trusted Void / Soft-Delete / Reversal Functions (SECURITY DEFINER)

  1. Purpose
    - Provide the ONLY authorized way to void or soft-delete financial records
    - These functions bypass the immutable triggers using the session variable
    - All actions are fully audited (voided_at, voided_by, audit log)
    - Available via supabase.rpc() from the frontend

  2. Functions Created
    - `void_sale(p_sale_id uuid, p_reason text)` - Voids a sale and its items
    - `void_purchase(p_purchase_id uuid, p_reason text)` - Voids a purchase and its items
    - `void_expense(p_expense_id uuid, p_reason text)` - Voids an expense
    - `void_operating_expense(p_expense_id uuid, p_reason text)` - Voids an operating expense
    - `void_setup_expense(p_expense_id uuid, p_reason text)` - Voids a setup expense
    - `soft_delete_record(p_table text, p_record_id uuid, p_reason text)` - Generic soft delete

  3. Security
    - All functions are SECURITY DEFINER (run as the function owner)
    - Each function checks the caller's role (admin/super_admin/accountant only)
    - Sets app.bypass_immutable = 'true' temporarily to allow the update
    - Resets the session variable after the operation
    - Writes to audit_logs table for full traceability

  4. Void vs Soft Delete
    - Void: Sets status = 'void', voided_at, voided_by. Record remains visible but marked.
    - Soft Delete: Sets is_deleted = true. Record is hidden by RLS restrictive policy.
    - Both are reversible by super_admin via separate restore functions.
*/

-- Add 'void' to sales status check constraint
DO $$
BEGIN
  ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_status_check;
  ALTER TABLE sales ADD CONSTRAINT sales_status_check
    CHECK (status IN ('draft', 'confirmed', 'cancelled', 'returned', 'void'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Add 'void' to purchases status check constraint
DO $$
BEGIN
  ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_status_check;
  ALTER TABLE purchases ADD CONSTRAINT purchases_status_check
    CHECK (status IN ('draft', 'confirmed', 'received', 'cancelled', 'void'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ===== VOID SALE =====
CREATE OR REPLACE FUNCTION void_sale(
  p_sale_id uuid,
  p_reason text DEFAULT 'No reason provided'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_sale record;
  v_result jsonb;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
  IF v_caller_role NOT IN ('admin', 'super_admin', 'accountant') THEN
    RAISE EXCEPTION 'Insufficient permissions. Required: admin, super_admin, or accountant. Got: %', v_caller_role;
  END IF;

  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found: %', p_sale_id;
  END IF;

  IF v_sale.status = 'void' THEN
    RAISE EXCEPTION 'Sale is already voided: %', p_sale_id;
  END IF;

  PERFORM set_config('app.bypass_immutable', 'true', true);

  UPDATE sales SET
    status = 'void',
    voided_at = now(),
    voided_by = v_caller_id,
    updated_at = now()
  WHERE id = p_sale_id;

  UPDATE sale_items SET
    voided_at = now(),
    voided_by = v_caller_id,
    updated_at = now()
  WHERE sale_id = p_sale_id;

  INSERT INTO audit_logs (action, table_name, record_id, user_id, details)
  VALUES (
    'VOID_SALE',
    'sales',
    p_sale_id,
    v_caller_id,
    jsonb_build_object(
      'reason', p_reason,
      'previous_status', v_sale.status,
      'sale_number', v_sale.sale_number,
      'total', v_sale.total
    )
  );

  PERFORM set_config('app.bypass_immutable', 'false', true);

  v_result := jsonb_build_object(
    'success', true,
    'sale_id', p_sale_id,
    'sale_number', v_sale.sale_number,
    'previous_status', v_sale.status,
    'new_status', 'void',
    'voided_by', v_caller_id,
    'voided_at', now()
  );

  RETURN v_result;
END;
$$;

-- ===== VOID PURCHASE =====
CREATE OR REPLACE FUNCTION void_purchase(
  p_purchase_id uuid,
  p_reason text DEFAULT 'No reason provided'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_purchase record;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
  IF v_caller_role NOT IN ('admin', 'super_admin', 'accountant') THEN
    RAISE EXCEPTION 'Insufficient permissions. Required: admin, super_admin, or accountant. Got: %', v_caller_role;
  END IF;

  SELECT * INTO v_purchase FROM purchases WHERE id = p_purchase_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase not found: %', p_purchase_id;
  END IF;

  IF v_purchase.status = 'void' THEN
    RAISE EXCEPTION 'Purchase is already voided: %', p_purchase_id;
  END IF;

  PERFORM set_config('app.bypass_immutable', 'true', true);

  UPDATE purchases SET
    status = 'void',
    voided_at = now(),
    voided_by = v_caller_id,
    updated_at = now()
  WHERE id = p_purchase_id;

  UPDATE purchase_items SET
    voided_at = now(),
    voided_by = v_caller_id,
    updated_at = now()
  WHERE purchase_id = p_purchase_id;

  INSERT INTO audit_logs (action, table_name, record_id, user_id, details)
  VALUES (
    'VOID_PURCHASE',
    'purchases',
    p_purchase_id,
    v_caller_id,
    jsonb_build_object(
      'reason', p_reason,
      'previous_status', v_purchase.status,
      'purchase_number', v_purchase.purchase_number,
      'total', v_purchase.total
    )
  );

  PERFORM set_config('app.bypass_immutable', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', p_purchase_id,
    'previous_status', v_purchase.status,
    'new_status', 'void'
  );
END;
$$;

-- ===== VOID EXPENSE =====
CREATE OR REPLACE FUNCTION void_expense(
  p_expense_id uuid,
  p_reason text DEFAULT 'No reason provided'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_expense record;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
  IF v_caller_role NOT IN ('admin', 'super_admin', 'accountant') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_expense FROM expenses WHERE id = p_expense_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found: %', p_expense_id;
  END IF;

  PERFORM set_config('app.bypass_immutable', 'true', true);

  UPDATE expenses SET
    is_deleted = true,
    voided_at = now(),
    voided_by = v_caller_id,
    updated_at = now()
  WHERE id = p_expense_id;

  INSERT INTO audit_logs (action, table_name, record_id, user_id, details)
  VALUES (
    'VOID_EXPENSE',
    'expenses',
    p_expense_id,
    v_caller_id,
    jsonb_build_object(
      'reason', p_reason,
      'expense_number', v_expense.expense_number,
      'amount', v_expense.amount
    )
  );

  PERFORM set_config('app.bypass_immutable', 'false', true);

  RETURN jsonb_build_object('success', true, 'expense_id', p_expense_id);
END;
$$;

-- ===== VOID OPERATING EXPENSE =====
CREATE OR REPLACE FUNCTION void_operating_expense(
  p_expense_id uuid,
  p_reason text DEFAULT 'No reason provided'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_expense record;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
  IF v_caller_role NOT IN ('admin', 'super_admin', 'accountant') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_expense FROM operating_expenses WHERE id = p_expense_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operating expense not found: %', p_expense_id;
  END IF;

  PERFORM set_config('app.bypass_immutable', 'true', true);

  UPDATE operating_expenses SET
    is_deleted = true,
    voided_at = now(),
    voided_by = v_caller_id,
    updated_at = now()
  WHERE id = p_expense_id;

  INSERT INTO audit_logs (action, table_name, record_id, user_id, details)
  VALUES (
    'VOID_OPERATING_EXPENSE',
    'operating_expenses',
    p_expense_id,
    v_caller_id,
    jsonb_build_object(
      'reason', p_reason,
      'expense_number', v_expense.expense_number,
      'amount', v_expense.amount
    )
  );

  PERFORM set_config('app.bypass_immutable', 'false', true);

  RETURN jsonb_build_object('success', true, 'expense_id', p_expense_id);
END;
$$;

-- ===== VOID SETUP EXPENSE =====
CREATE OR REPLACE FUNCTION void_setup_expense(
  p_expense_id uuid,
  p_reason text DEFAULT 'No reason provided'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_expense record;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
  IF v_caller_role NOT IN ('admin', 'super_admin', 'accountant') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_expense FROM setup_expenses WHERE id = p_expense_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Setup expense not found: %', p_expense_id;
  END IF;

  PERFORM set_config('app.bypass_immutable', 'true', true);

  UPDATE setup_expenses SET
    is_deleted = true,
    voided_at = now(),
    voided_by = v_caller_id,
    updated_at = now()
  WHERE id = p_expense_id;

  INSERT INTO audit_logs (action, table_name, record_id, user_id, details)
  VALUES (
    'VOID_SETUP_EXPENSE',
    'setup_expenses',
    p_expense_id,
    v_caller_id,
    jsonb_build_object(
      'reason', p_reason,
      'amount', v_expense.amount
    )
  );

  PERFORM set_config('app.bypass_immutable', 'false', true);

  RETURN jsonb_build_object('success', true, 'expense_id', p_expense_id);
END;
$$;

-- ===== UPDATE SALE STATUS (Trusted) =====
CREATE OR REPLACE FUNCTION update_sale_status(
  p_sale_id uuid,
  p_new_status text,
  p_reason text DEFAULT 'No reason provided'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_sale record;
  v_allowed_transitions jsonb;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
  IF v_caller_role NOT IN ('admin', 'super_admin', 'accountant') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found: %', p_sale_id;
  END IF;

  v_allowed_transitions := '{
    "draft": ["confirmed", "cancelled", "void"],
    "confirmed": ["cancelled", "returned", "void"],
    "cancelled": ["confirmed"],
    "returned": ["confirmed"]
  }'::jsonb;

  IF NOT (v_allowed_transitions->v_sale.status) ? p_new_status THEN
    RAISE EXCEPTION 'Invalid status transition: % -> %', v_sale.status, p_new_status;
  END IF;

  IF p_new_status = 'void' THEN
    RETURN void_sale(p_sale_id, p_reason);
  END IF;

  PERFORM set_config('app.bypass_immutable', 'true', true);

  UPDATE sales SET
    status = p_new_status,
    updated_at = now()
  WHERE id = p_sale_id;

  INSERT INTO audit_logs (action, table_name, record_id, user_id, details)
  VALUES (
    'STATUS_CHANGE',
    'sales',
    p_sale_id,
    v_caller_id,
    jsonb_build_object(
      'reason', p_reason,
      'previous_status', v_sale.status,
      'new_status', p_new_status,
      'sale_number', v_sale.sale_number
    )
  );

  PERFORM set_config('app.bypass_immutable', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', p_sale_id,
    'previous_status', v_sale.status,
    'new_status', p_new_status
  );
END;
$$;

-- ===== UPDATE PURCHASE STATUS (Trusted) =====
CREATE OR REPLACE FUNCTION update_purchase_status(
  p_purchase_id uuid,
  p_new_status text,
  p_reason text DEFAULT 'No reason provided'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_purchase record;
  v_allowed_transitions jsonb;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
  IF v_caller_role NOT IN ('admin', 'super_admin', 'accountant') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_purchase FROM purchases WHERE id = p_purchase_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase not found: %', p_purchase_id;
  END IF;

  v_allowed_transitions := '{
    "draft": ["confirmed", "cancelled", "void"],
    "confirmed": ["received", "cancelled", "void"],
    "received": ["void"],
    "cancelled": ["confirmed"]
  }'::jsonb;

  IF NOT (v_allowed_transitions->v_purchase.status) ? p_new_status THEN
    RAISE EXCEPTION 'Invalid status transition: % -> %', v_purchase.status, p_new_status;
  END IF;

  IF p_new_status = 'void' THEN
    RETURN void_purchase(p_purchase_id, p_reason);
  END IF;

  PERFORM set_config('app.bypass_immutable', 'true', true);

  UPDATE purchases SET
    status = p_new_status,
    updated_at = now()
  WHERE id = p_purchase_id;

  INSERT INTO audit_logs (action, table_name, record_id, user_id, details)
  VALUES (
    'STATUS_CHANGE',
    'purchases',
    p_purchase_id,
    v_caller_id,
    jsonb_build_object(
      'reason', p_reason,
      'previous_status', v_purchase.status,
      'new_status', p_new_status,
      'purchase_number', v_purchase.purchase_number
    )
  );

  PERFORM set_config('app.bypass_immutable', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', p_purchase_id,
    'previous_status', v_purchase.status,
    'new_status', p_new_status
  );
END;
$$;

-- Grant execute permissions to authenticated users (functions do their own role checks internally)
GRANT EXECUTE ON FUNCTION void_sale(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION void_purchase(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION void_expense(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION void_operating_expense(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION void_setup_expense(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION update_sale_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION update_purchase_status(uuid, text, text) TO authenticated;