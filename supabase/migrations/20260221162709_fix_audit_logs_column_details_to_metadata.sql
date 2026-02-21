/*
  # Fix audit_logs column: replace 'details' with 'metadata'

  All void/status-change functions were inserting into audit_logs using column name "details"
  but the actual column is named "metadata". This caused every delete/void operation to fail.

  Changes:
  - Recreate all 7 functions replacing details -> metadata in the INSERT INTO audit_logs statement
  - No schema changes, no table changes
*/

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

  INSERT INTO audit_logs (action, table_name, record_id, user_id, metadata)
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

  INSERT INTO audit_logs (action, table_name, record_id, user_id, metadata)
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

  INSERT INTO audit_logs (action, table_name, record_id, user_id, metadata)
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

  INSERT INTO audit_logs (action, table_name, record_id, user_id, metadata)
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

  INSERT INTO audit_logs (action, table_name, record_id, user_id, metadata)
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

  INSERT INTO audit_logs (action, table_name, record_id, user_id, metadata)
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

  INSERT INTO audit_logs (action, table_name, record_id, user_id, metadata)
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

GRANT EXECUTE ON FUNCTION void_sale(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION void_purchase(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION void_expense(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION void_operating_expense(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION void_setup_expense(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION update_sale_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION update_purchase_status(uuid, text, text) TO authenticated;
