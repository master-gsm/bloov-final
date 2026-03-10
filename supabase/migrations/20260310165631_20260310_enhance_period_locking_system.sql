/*
  # Enhanced Financial Period Locking System
  
  ## Overview
  Strengthens the accounting period locking to prevent any modifications
  to financial data after a period is closed.
  
  ## Changes
  1. Create helper function `fn_is_period_locked(p_date)` for easy period checks
  2. Create function `fn_close_accounting_period()` with validation and audit
  3. Create function `fn_reopen_accounting_period()` with admin-only access and audit
  4. Add triggers to protect sales, purchases, expenses from closed period modifications
  
  ## Security
  - Only admin/super_admin can close/reopen periods
  - All period state changes are logged to audit_logs
  - Database-level enforcement cannot be bypassed
*/

-- 1. Helper function to check if a date falls within a locked period
CREATE OR REPLACE FUNCTION public.fn_is_period_locked(p_date DATE)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_is_locked BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM accounting_periods
    WHERE p_date BETWEEN start_date AND end_date
      AND (is_closed = true OR status = 'Closed')
  ) INTO v_is_locked;
  
  RETURN COALESCE(v_is_locked, false);
END;
$$;

-- 2. Helper function to get the locked period name for error messages
CREATE OR REPLACE FUNCTION public.fn_get_locked_period_name(p_date DATE)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_period_name TEXT;
BEGIN
  SELECT name INTO v_period_name
  FROM accounting_periods
  WHERE p_date BETWEEN start_date AND end_date
    AND (is_closed = true OR status = 'Closed')
  LIMIT 1;
  
  RETURN v_period_name;
END;
$$;

-- 3. Function to close an accounting period with validation and audit
CREATE OR REPLACE FUNCTION public.fn_close_accounting_period(
  p_period_id UUID,
  p_reason TEXT DEFAULT 'Monthly close'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period RECORD;
  v_caller_id UUID;
  v_caller_role TEXT;
  v_unposted_count INT;
BEGIN
  v_caller_id := auth.uid();
  SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
  
  IF v_caller_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'ACCESS_DENIED: Only administrators can close accounting periods';
  END IF;
  
  SELECT * INTO v_period FROM accounting_periods WHERE id = p_period_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: Accounting period does not exist';
  END IF;
  
  IF v_period.is_closed = true OR v_period.status = 'Closed' THEN
    RAISE EXCEPTION 'ALREADY_CLOSED: Period "%" is already closed', v_period.name;
  END IF;
  
  SELECT COUNT(*) INTO v_unposted_count
  FROM journal_entries
  WHERE date BETWEEN v_period.start_date AND v_period.end_date
    AND status != 'Posted';
  
  IF v_unposted_count > 0 THEN
    RAISE EXCEPTION 'UNPOSTED_ENTRIES: Cannot close period - % unposted journal entries exist', v_unposted_count;
  END IF;
  
  UPDATE accounting_periods
  SET is_closed = true,
      status = 'Closed',
      closed_at = NOW(),
      closed_by = v_caller_id,
      updated_at = NOW()
  WHERE id = p_period_id;
  
  INSERT INTO audit_logs (action, table_name, record_id, user_id, metadata)
  VALUES (
    'PERIOD_CLOSED',
    'accounting_periods',
    p_period_id,
    v_caller_id,
    jsonb_build_object(
      'period_name', v_period.name,
      'start_date', v_period.start_date,
      'end_date', v_period.end_date,
      'reason', p_reason,
      'closed_at', NOW()
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'period_name', v_period.name,
    'closed_at', NOW()
  );
END;
$$;

-- 4. Function to reopen an accounting period (restricted, requires strong reason)
CREATE OR REPLACE FUNCTION public.fn_reopen_accounting_period(
  p_period_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period RECORD;
  v_caller_id UUID;
  v_caller_role TEXT;
BEGIN
  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 20 THEN
    RAISE EXCEPTION 'REASON_REQUIRED: A detailed reason (min 20 chars) is required to reopen a closed period';
  END IF;
  
  v_caller_id := auth.uid();
  SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
  
  IF v_caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'ACCESS_DENIED: Only super administrators can reopen closed periods';
  END IF;
  
  SELECT * INTO v_period FROM accounting_periods WHERE id = p_period_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: Accounting period does not exist';
  END IF;
  
  IF v_period.is_closed = false AND v_period.status = 'Open' THEN
    RAISE EXCEPTION 'ALREADY_OPEN: Period "%" is already open', v_period.name;
  END IF;
  
  UPDATE accounting_periods
  SET is_closed = false,
      status = 'Open',
      closed_at = NULL,
      closed_by = NULL,
      updated_at = NOW()
  WHERE id = p_period_id;
  
  INSERT INTO audit_logs (action, table_name, record_id, user_id, metadata)
  VALUES (
    'PERIOD_REOPENED',
    'accounting_periods',
    p_period_id,
    v_caller_id,
    jsonb_build_object(
      'period_name', v_period.name,
      'start_date', v_period.start_date,
      'end_date', v_period.end_date,
      'reason', p_reason,
      'original_closed_at', v_period.closed_at,
      'original_closed_by', v_period.closed_by,
      'reopened_at', NOW(),
      'warning', 'SECURITY_EVENT: Closed period was reopened'
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'period_name', v_period.name,
    'reopened_at', NOW(),
    'warning', 'Period reopened - all modifications will be logged'
  );
END;
$$;

-- 5. Trigger function to protect sales from closed period modifications
CREATE OR REPLACE FUNCTION public.protect_sales_closed_periods()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check_date DATE;
  v_period_name TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_check_date := OLD.sale_date;
  ELSE
    v_check_date := NEW.sale_date;
  END IF;
  
  IF fn_is_period_locked(v_check_date) THEN
    v_period_name := fn_get_locked_period_name(v_check_date);
    RAISE EXCEPTION 'PERIOD_LOCKED: Cannot % sale in closed period "%". Contact administrator to reopen period if correction is needed.',
      CASE TG_OP 
        WHEN 'INSERT' THEN 'create'
        WHEN 'UPDATE' THEN 'modify'
        WHEN 'DELETE' THEN 'delete'
      END,
      v_period_name;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_sales_closed_periods ON sales;
CREATE TRIGGER trg_protect_sales_closed_periods
  BEFORE INSERT OR UPDATE OR DELETE ON sales
  FOR EACH ROW
  EXECUTE FUNCTION protect_sales_closed_periods();

-- 6. Trigger function to protect purchases from closed period modifications
CREATE OR REPLACE FUNCTION public.protect_purchases_closed_periods()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check_date DATE;
  v_period_name TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_check_date := OLD.purchase_date;
  ELSE
    v_check_date := NEW.purchase_date;
  END IF;
  
  IF fn_is_period_locked(v_check_date) THEN
    v_period_name := fn_get_locked_period_name(v_check_date);
    RAISE EXCEPTION 'PERIOD_LOCKED: Cannot % purchase in closed period "%". Contact administrator to reopen period if correction is needed.',
      CASE TG_OP 
        WHEN 'INSERT' THEN 'create'
        WHEN 'UPDATE' THEN 'modify'
        WHEN 'DELETE' THEN 'delete'
      END,
      v_period_name;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_purchases_closed_periods ON purchases;
CREATE TRIGGER trg_protect_purchases_closed_periods
  BEFORE INSERT OR UPDATE OR DELETE ON purchases
  FOR EACH ROW
  EXECUTE FUNCTION protect_purchases_closed_periods();

-- 7. Trigger function to protect operating expenses from closed period modifications
CREATE OR REPLACE FUNCTION public.protect_expenses_closed_periods()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check_date DATE;
  v_period_name TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_check_date := OLD.expense_date;
  ELSE
    v_check_date := NEW.expense_date;
  END IF;
  
  IF v_check_date IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  
  IF fn_is_period_locked(v_check_date) THEN
    v_period_name := fn_get_locked_period_name(v_check_date);
    RAISE EXCEPTION 'PERIOD_LOCKED: Cannot % expense in closed period "%". Contact administrator to reopen period if correction is needed.',
      CASE TG_OP 
        WHEN 'INSERT' THEN 'create'
        WHEN 'UPDATE' THEN 'modify'
        WHEN 'DELETE' THEN 'delete'
      END,
      v_period_name;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_expenses_closed_periods ON operating_expenses;
CREATE TRIGGER trg_protect_expenses_closed_periods
  BEFORE INSERT OR UPDATE OR DELETE ON operating_expenses
  FOR EACH ROW
  EXECUTE FUNCTION protect_expenses_closed_periods();

-- 8. View for period status dashboard
DROP VIEW IF EXISTS v_accounting_periods_status;
CREATE VIEW v_accounting_periods_status AS
SELECT 
  ap.id,
  ap.name,
  ap.start_date,
  ap.end_date,
  ap.is_closed,
  ap.status,
  ap.closed_at,
  u.full_name as closed_by_name,
  (SELECT COUNT(*) FROM journal_entries je 
   WHERE je.date BETWEEN ap.start_date AND ap.end_date) as total_entries,
  (SELECT COUNT(*) FROM journal_entries je 
   WHERE je.date BETWEEN ap.start_date AND ap.end_date 
   AND je.status = 'Posted') as posted_entries,
  (SELECT COUNT(*) FROM journal_entries je 
   WHERE je.date BETWEEN ap.start_date AND ap.end_date 
   AND je.status != 'Posted') as unposted_entries,
  (SELECT COALESCE(SUM(jl.debit), 0) FROM journal_entries je
   JOIN journal_lines jl ON jl.journal_entry_id = je.id
   WHERE je.date BETWEEN ap.start_date AND ap.end_date
   AND je.status = 'Posted') as total_debits,
  (SELECT COUNT(*) FROM sales s 
   WHERE s.sale_date BETWEEN ap.start_date AND ap.end_date) as sales_count,
  (SELECT COUNT(*) FROM purchases p 
   WHERE p.purchase_date BETWEEN ap.start_date AND ap.end_date) as purchases_count
FROM accounting_periods ap
LEFT JOIN users u ON u.id = ap.closed_by
ORDER BY ap.start_date DESC;

COMMENT ON FUNCTION fn_is_period_locked IS 'Check if a given date falls within a closed accounting period';
COMMENT ON FUNCTION fn_close_accounting_period IS 'Close an accounting period with validation - admin only';
COMMENT ON FUNCTION fn_reopen_accounting_period IS 'Reopen a closed period - super_admin only, requires detailed reason';
