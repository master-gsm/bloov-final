/*
  # Comprehensive Audit Logging System
  
  ## Overview
  Enhances the audit logging to capture all sensitive operations:
  - Invoice modifications (sales/purchases)
  - Inventory changes
  - Partner settlements
  - User management actions
  - Financial document status changes
  
  ## Changes
  1. Create audit trigger function for generic table auditing
  2. Add audit triggers to sensitive tables
  3. Create helper function for manual audit logging
  4. Create audit log views for reporting
  
  ## Security
  - Audit logs cannot be modified or deleted (enforced by trigger)
  - All operations are timestamped with user context
*/

-- 1. Prevent any modifications to audit_logs table
CREATE OR REPLACE FUNCTION public.protect_audit_logs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'AUDIT_IMMUTABLE: Audit logs cannot be modified';
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AUDIT_IMMUTABLE: Audit logs cannot be deleted';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_audit_logs ON audit_logs;
CREATE TRIGGER trg_protect_audit_logs
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION protect_audit_logs();

-- 2. Generic audit trigger function
CREATE OR REPLACE FUNCTION public.fn_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_action TEXT;
  v_old_data JSONB;
  v_new_data JSONB;
  v_record_id UUID;
  v_branch_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_new_data := to_jsonb(NEW);
    v_old_data := NULL;
    v_record_id := NEW.id;
    v_branch_id := CASE WHEN TG_TABLE_NAME IN ('sales', 'purchases', 'operating_expenses', 'inventory') 
                        THEN NEW.branch_id ELSE NULL END;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    v_record_id := NEW.id;
    v_branch_id := CASE WHEN TG_TABLE_NAME IN ('sales', 'purchases', 'operating_expenses', 'inventory') 
                        THEN NEW.branch_id ELSE NULL END;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
    v_record_id := OLD.id;
    v_branch_id := CASE WHEN TG_TABLE_NAME IN ('sales', 'purchases', 'operating_expenses', 'inventory') 
                        THEN OLD.branch_id ELSE NULL END;
  END IF;
  
  INSERT INTO audit_logs (
    user_id, 
    action, 
    table_name, 
    record_id, 
    branch_id,
    old_data, 
    new_data,
    metadata
  )
  VALUES (
    v_user_id,
    v_action || '_' || UPPER(TG_TABLE_NAME),
    TG_TABLE_NAME,
    v_record_id,
    v_branch_id,
    v_old_data,
    v_new_data,
    jsonb_build_object(
      'trigger_operation', TG_OP,
      'timestamp', NOW(),
      'schema', TG_TABLE_SCHEMA
    )
  );
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Audit trigger for sales table
DROP TRIGGER IF EXISTS trg_audit_sales ON sales;
CREATE TRIGGER trg_audit_sales
  AFTER INSERT OR UPDATE OR DELETE ON sales
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_trigger();

-- 4. Audit trigger for purchases table
DROP TRIGGER IF EXISTS trg_audit_purchases ON purchases;
CREATE TRIGGER trg_audit_purchases
  AFTER INSERT OR UPDATE OR DELETE ON purchases
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_trigger();

-- 5. Audit trigger for inventory changes
DROP TRIGGER IF EXISTS trg_audit_inventory ON inventory;
CREATE TRIGGER trg_audit_inventory
  AFTER INSERT OR UPDATE OR DELETE ON inventory
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_trigger();

-- 6. Audit trigger for partner_settlements
DROP TRIGGER IF EXISTS trg_audit_partner_settlements ON partner_settlements;
CREATE TRIGGER trg_audit_partner_settlements
  AFTER INSERT OR UPDATE OR DELETE ON partner_settlements
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_trigger();

-- 7. Audit trigger for partner_contributions
DROP TRIGGER IF EXISTS trg_audit_partner_contributions ON partner_contributions;
CREATE TRIGGER trg_audit_partner_contributions
  AFTER INSERT OR UPDATE OR DELETE ON partner_contributions
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_trigger();

-- 8. Audit trigger for operating_expenses
DROP TRIGGER IF EXISTS trg_audit_operating_expenses ON operating_expenses;
CREATE TRIGGER trg_audit_operating_expenses
  AFTER INSERT OR UPDATE OR DELETE ON operating_expenses
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_trigger();

-- 9. Audit trigger for users table (important for security)
DROP TRIGGER IF EXISTS trg_audit_users ON users;
CREATE TRIGGER trg_audit_users
  AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_trigger();

-- 10. Helper function for manual audit logging
CREATE OR REPLACE FUNCTION public.fn_log_audit(
  p_action TEXT,
  p_table_name TEXT,
  p_record_id UUID,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_old_data JSONB DEFAULT NULL,
  p_new_data JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_id UUID;
  v_user_id UUID;
  v_branch_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  SELECT branch_id INTO v_branch_id FROM users WHERE id = v_user_id;
  
  INSERT INTO audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    branch_id,
    old_data,
    new_data,
    metadata
  )
  VALUES (
    v_user_id,
    p_action,
    p_table_name,
    p_record_id,
    v_branch_id,
    p_old_data,
    p_new_data,
    p_metadata || jsonb_build_object('logged_at', NOW())
  )
  RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$;

-- 11. View for audit log dashboard with user info
DROP VIEW IF EXISTS v_audit_logs_detailed;
CREATE VIEW v_audit_logs_detailed AS
SELECT 
  al.id,
  al.created_at,
  al.action,
  al.table_name,
  al.record_id,
  u.full_name as user_name,
  u.role as user_role,
  b.name as branch_name,
  al.old_data,
  al.new_data,
  al.metadata,
  CASE 
    WHEN al.action LIKE '%DELETE%' OR al.action LIKE '%VOID%' THEN 'danger'
    WHEN al.action LIKE '%UPDATE%' OR al.action LIKE '%MODIFY%' THEN 'warning'
    WHEN al.action LIKE '%CREATE%' OR al.action LIKE '%INSERT%' THEN 'success'
    ELSE 'info'
  END as severity
FROM audit_logs al
LEFT JOIN users u ON u.id = al.user_id
LEFT JOIN branches b ON b.id = al.branch_id
ORDER BY al.created_at DESC;

-- 12. View for security-related audit events
DROP VIEW IF EXISTS v_security_audit_events;
CREATE VIEW v_security_audit_events AS
SELECT 
  al.id,
  al.created_at,
  al.action,
  al.table_name,
  al.record_id,
  u.full_name as user_name,
  al.metadata
FROM audit_logs al
LEFT JOIN users u ON u.id = al.user_id
WHERE al.action IN (
  'PERIOD_CLOSED', 'PERIOD_REOPENED',
  'VOID_SALE', 'VOID_PURCHASE', 'VOID_EXPENSE',
  'CREATE_USERS', 'UPDATE_USERS', 'DELETE_USERS',
  'STATUS_CHANGE', 'ROLE_CHANGE',
  'LOGIN_FAILED', 'PASSWORD_RESET'
)
OR al.table_name = 'users'
ORDER BY al.created_at DESC;

-- 13. Summary statistics function
CREATE OR REPLACE FUNCTION public.fn_get_audit_summary(
  p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  action_type TEXT,
  total_count BIGINT,
  unique_users BIGINT,
  last_occurrence TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    al.action as action_type,
    COUNT(*) as total_count,
    COUNT(DISTINCT al.user_id) as unique_users,
    MAX(al.created_at) as last_occurrence
  FROM audit_logs al
  WHERE al.created_at::date BETWEEN p_start_date AND p_end_date
  GROUP BY al.action
  ORDER BY total_count DESC;
END;
$$;

COMMENT ON FUNCTION fn_audit_trigger IS 'Generic audit trigger for capturing all changes to sensitive tables';
COMMENT ON FUNCTION fn_log_audit IS 'Helper function for manual audit logging from application code';
COMMENT ON FUNCTION fn_get_audit_summary IS 'Get audit activity summary for a date range';
