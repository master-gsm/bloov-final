/*
  # إصلاح عمود details في audit_logs

  1. المشكلة
    - Functions قديمة تستخدم عمود "details" غير موجود
    - العمود الصحيح هو "metadata"

  2. الإصلاح
    - تعديل جميع functions لاستخدام "metadata" بدلاً من "details"
*/

-- ═══════════════════════════════════════════════════════════
-- Fix void_sale function
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION trusted_void_sale(
  p_sale_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID;
  v_sale RECORD;
BEGIN
  v_caller_id := auth.uid();
  
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id AND is_deleted = false;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found or already deleted';
  END IF;

  IF v_sale.status = 'cancelled' THEN
    RAISE EXCEPTION 'Sale is already cancelled';
  END IF;

  UPDATE sales SET
    status = 'cancelled',
    voided_at = now(),
    voided_by = v_caller_id,
    updated_at = now(),
    version = version + 1
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
END;
$function$;

-- ═══════════════════════════════════════════════════════════
-- Fix void_purchase function
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION trusted_void_purchase(
  p_purchase_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID;
  v_purchase RECORD;
BEGIN
  v_caller_id := auth.uid();
  
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  SELECT * INTO v_purchase FROM purchases WHERE id = p_purchase_id AND is_deleted = false;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase not found or already deleted';
  END IF;

  IF v_purchase.status = 'cancelled' THEN
    RAISE EXCEPTION 'Purchase is already cancelled';
  END IF;

  UPDATE purchases SET
    status = 'cancelled',
    voided_at = now(),
    voided_by = v_caller_id,
    updated_at = now(),
    version = version + 1
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
END;
$function$;

-- ═══════════════════════════════════════════════════════════
-- Fix void_expense function
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION trusted_void_expense(
  p_expense_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID;
  v_expense RECORD;
BEGIN
  v_caller_id := auth.uid();
  
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  SELECT * INTO v_expense FROM expenses WHERE id = p_expense_id AND is_deleted = false;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found or already deleted';
  END IF;

  UPDATE expenses SET
    is_deleted = true,
    deleted_at = now(),
    voided_at = now(),
    voided_by = v_caller_id,
    updated_at = now(),
    version = version + 1
  WHERE id = p_expense_id;

  INSERT INTO audit_logs (action, table_name, record_id, user_id, metadata)
  VALUES (
    'VOID_EXPENSE',
    'expenses',
    p_expense_id,
    v_caller_id,
    jsonb_build_object(
      'reason', p_reason,
      'amount', v_expense.amount,
      'category', v_expense.category
    )
  );
END;
$function$;

-- ═══════════════════════════════════════════════════════════
-- Fix void_operating_expense function
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION trusted_void_operating_expense(
  p_expense_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID;
  v_expense RECORD;
BEGIN
  v_caller_id := auth.uid();
  
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  SELECT * INTO v_expense FROM operating_expenses WHERE id = p_expense_id AND is_deleted = false;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operating expense not found or already deleted';
  END IF;

  UPDATE operating_expenses SET
    is_deleted = true,
    deleted_at = now(),
    voided_at = now(),
    voided_by = v_caller_id,
    updated_at = now(),
    version = version + 1
  WHERE id = p_expense_id;

  INSERT INTO audit_logs (action, table_name, record_id, user_id, metadata)
  VALUES (
    'VOID_OPERATING_EXPENSE',
    'operating_expenses',
    p_expense_id,
    v_caller_id,
    jsonb_build_object(
      'reason', p_reason,
      'amount', v_expense.amount
    )
  );
END;
$function$;

-- ═══════════════════════════════════════════════════════════
-- Fix void_setup_expense function
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION trusted_void_setup_expense(
  p_expense_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID;
  v_expense RECORD;
BEGIN
  v_caller_id := auth.uid();
  
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  SELECT * INTO v_expense FROM setup_expenses WHERE id = p_expense_id AND is_deleted = false;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Setup expense not found or already deleted';
  END IF;

  UPDATE setup_expenses SET
    is_deleted = true,
    deleted_at = now(),
    voided_at = now(),
    voided_by = v_caller_id,
    updated_at = now(),
    version = version + 1
  WHERE id = p_expense_id;

  INSERT INTO audit_logs (action, table_name, record_id, user_id, metadata)
  VALUES (
    'VOID_SETUP_EXPENSE',
    'setup_expenses',
    p_expense_id,
    v_caller_id,
    jsonb_build_object(
      'reason', p_reason,
      'amount', v_expense.amount,
      'category', v_expense.category
    )
  );
END;
$function$;

-- ═══════════════════════════════════════════════════════════
-- Fix change_sale_status function
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION trusted_change_sale_status(
  p_sale_id UUID,
  p_new_status TEXT,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID;
  v_old_status TEXT;
BEGIN
  v_caller_id := auth.uid();
  
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  SELECT status INTO v_old_status FROM sales WHERE id = p_sale_id AND is_deleted = false;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;

  IF p_new_status NOT IN ('confirmed', 'returned', 'cancelled', 'draft') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  UPDATE sales SET
    status = p_new_status,
    updated_at = now(),
    version = version + 1
  WHERE id = p_sale_id;

  INSERT INTO audit_logs (action, table_name, record_id, user_id, metadata)
  VALUES (
    'STATUS_CHANGE',
    'sales',
    p_sale_id,
    v_caller_id,
    jsonb_build_object(
      'reason', p_reason,
      'old_status', v_old_status,
      'new_status', p_new_status
    )
  );
END;
$function$;

-- ═══════════════════════════════════════════════════════════
-- Fix change_purchase_status function
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION trusted_change_purchase_status(
  p_purchase_id UUID,
  p_new_status TEXT,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID;
  v_old_status TEXT;
BEGIN
  v_caller_id := auth.uid();
  
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  SELECT status INTO v_old_status FROM purchases WHERE id = p_purchase_id AND is_deleted = false;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase not found';
  END IF;

  IF p_new_status NOT IN ('confirmed', 'returned', 'cancelled', 'draft') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  UPDATE purchases SET
    status = p_new_status,
    updated_at = now(),
    version = version + 1
  WHERE id = p_purchase_id;

  INSERT INTO audit_logs (action, table_name, record_id, user_id, metadata)
  VALUES (
    'STATUS_CHANGE',
    'purchases',
    p_purchase_id,
    v_caller_id,
    jsonb_build_object(
      'reason', p_reason,
      'old_status', v_old_status,
      'new_status', p_new_status
    )
  );
END;
$function$;
