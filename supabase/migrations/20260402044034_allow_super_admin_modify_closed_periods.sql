/*
  # Allow Super Admin to Modify Data in Closed Periods

  ## Overview
  Updates the period locking system to allow super_admin users to make
  modifications in closed periods while maintaining restrictions for all
  other users.

  ## Changes
  1. Create fn_can_bypass_period_lock() - checks if current user is super_admin
  2. Update fn_is_period_locked() to accept optional bypass check
  3. Update protect_sales_closed_periods() trigger to allow super_admin
  4. Update protect_purchases_closed_periods() trigger to allow super_admin  
  5. Update protect_expenses_closed_periods() trigger to allow super_admin
  6. Add audit logging for all super_admin modifications in closed periods

  ## Security
  - Only super_admin can bypass period lock
  - All bypass operations are logged to audit_logs with detailed metadata
  - RLS policies remain unchanged - super_admin still bound by company isolation
  - Original dates preserved, only data corrected
*/

-- 1. Create function to check if current user can bypass period lock
CREATE OR REPLACE FUNCTION public.fn_can_bypass_period_lock()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  SELECT role INTO v_caller_role 
  FROM users 
  WHERE id = auth.uid();
  
  RETURN v_caller_role = 'super_admin';
END;
$$;

-- 2. Create function to log super_admin modifications in closed periods
CREATE OR REPLACE FUNCTION public.fn_log_closed_period_modification(
  p_table_name TEXT,
  p_record_id UUID,
  p_operation TEXT,
  p_old_data JSONB,
  p_new_data JSONB,
  p_period_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO audit_logs (action, table_name, record_id, user_id, metadata)
  VALUES (
    'CLOSED_PERIOD_MODIFICATION',
    p_table_name,
    p_record_id,
    auth.uid(),
    jsonb_build_object(
      'operation', p_operation,
      'period_name', p_period_name,
      'old_data', p_old_data,
      'new_data', p_new_data,
      'modified_at', NOW(),
      'warning', 'AUDIT_EVENT: Data modified in closed period by super_admin',
      'modifier_id', auth.uid()
    )
  );
END;
$$;

-- 3. Update protect_sales_closed_periods trigger to allow super_admin
CREATE OR REPLACE FUNCTION public.protect_sales_closed_periods()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check_date DATE;
  v_period_name TEXT;
  v_is_super_admin BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_check_date := OLD.sale_date;
  ELSE
    v_check_date := NEW.sale_date;
  END IF;
  
  IF fn_is_period_locked(v_check_date) THEN
    v_is_super_admin := fn_can_bypass_period_lock();
    
    IF v_is_super_admin THEN
      v_period_name := fn_get_locked_period_name(v_check_date);
      
      PERFORM fn_log_closed_period_modification(
        'sales',
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        v_period_name
      );
      
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
      RETURN NEW;
    END IF;
    
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

-- 4. Update protect_purchases_closed_periods trigger to allow super_admin
CREATE OR REPLACE FUNCTION public.protect_purchases_closed_periods()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check_date DATE;
  v_period_name TEXT;
  v_is_super_admin BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_check_date := OLD.purchase_date;
  ELSE
    v_check_date := NEW.purchase_date;
  END IF;
  
  IF fn_is_period_locked(v_check_date) THEN
    v_is_super_admin := fn_can_bypass_period_lock();
    
    IF v_is_super_admin THEN
      v_period_name := fn_get_locked_period_name(v_check_date);
      
      PERFORM fn_log_closed_period_modification(
        'purchases',
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        v_period_name
      );
      
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
      RETURN NEW;
    END IF;
    
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

-- 5. Update protect_expenses_closed_periods trigger to allow super_admin
CREATE OR REPLACE FUNCTION public.protect_expenses_closed_periods()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check_date DATE;
  v_period_name TEXT;
  v_is_super_admin BOOLEAN;
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
    v_is_super_admin := fn_can_bypass_period_lock();
    
    IF v_is_super_admin THEN
      v_period_name := fn_get_locked_period_name(v_check_date);
      
      PERFORM fn_log_closed_period_modification(
        'operating_expenses',
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        v_period_name
      );
      
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
      RETURN NEW;
    END IF;
    
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

-- 6. Add protection for journal_entries as well
CREATE OR REPLACE FUNCTION public.protect_journal_entries_closed_periods()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check_date DATE;
  v_period_name TEXT;
  v_is_super_admin BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_check_date := OLD.date;
  ELSE
    v_check_date := NEW.date;
  END IF;
  
  IF v_check_date IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  
  IF fn_is_period_locked(v_check_date) THEN
    v_is_super_admin := fn_can_bypass_period_lock();
    
    IF v_is_super_admin THEN
      v_period_name := fn_get_locked_period_name(v_check_date);
      
      PERFORM fn_log_closed_period_modification(
        'journal_entries',
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        v_period_name
      );
      
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
      RETURN NEW;
    END IF;
    
    v_period_name := fn_get_locked_period_name(v_check_date);
    RAISE EXCEPTION 'PERIOD_LOCKED: Cannot % journal entry in closed period "%". Contact administrator to reopen period if correction is needed.',
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

DROP TRIGGER IF EXISTS trg_protect_journal_entries_closed_periods ON journal_entries;
CREATE TRIGGER trg_protect_journal_entries_closed_periods
  BEFORE INSERT OR UPDATE OR DELETE ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION protect_journal_entries_closed_periods();

-- 7. Add protection for cash_transactions
CREATE OR REPLACE FUNCTION public.protect_cash_transactions_closed_periods()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check_date DATE;
  v_period_name TEXT;
  v_is_super_admin BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_check_date := OLD.transaction_date::DATE;
  ELSE
    v_check_date := NEW.transaction_date::DATE;
  END IF;
  
  IF v_check_date IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  
  IF fn_is_period_locked(v_check_date) THEN
    v_is_super_admin := fn_can_bypass_period_lock();
    
    IF v_is_super_admin THEN
      v_period_name := fn_get_locked_period_name(v_check_date);
      
      PERFORM fn_log_closed_period_modification(
        'cash_transactions',
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        v_period_name
      );
      
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
      RETURN NEW;
    END IF;
    
    v_period_name := fn_get_locked_period_name(v_check_date);
    RAISE EXCEPTION 'PERIOD_LOCKED: Cannot % cash transaction in closed period "%". Contact administrator to reopen period if correction is needed.',
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

DROP TRIGGER IF EXISTS trg_protect_cash_transactions_closed_periods ON cash_transactions;
CREATE TRIGGER trg_protect_cash_transactions_closed_periods
  BEFORE INSERT OR UPDATE OR DELETE ON cash_transactions
  FOR EACH ROW
  EXECUTE FUNCTION protect_cash_transactions_closed_periods();

-- 8. Comments
COMMENT ON FUNCTION fn_can_bypass_period_lock IS 'Check if current user (super_admin) can bypass period lock restrictions';
COMMENT ON FUNCTION fn_log_closed_period_modification IS 'Log all modifications made by super_admin in closed periods for audit trail';
