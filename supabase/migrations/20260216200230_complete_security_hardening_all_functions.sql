/*
  # Complete Security Hardening - search_path Pinning for All SECURITY DEFINER Functions
  
  ## Overview
  This migration addresses critical security vulnerabilities by applying
  `SET search_path = public, pg_temp` to all 35 SECURITY DEFINER functions
  that were missing this protection, preventing Schema Hijacking attacks.
  
  ## Security Impact
  - Prevents Schema Hijacking/Trojan Horse attacks
  - Ensures functions only use public schema and temp tables
  - Protects against malicious function/table shadowing
  
  ## Changes Made
  
  ### Part 1: execute_sql_as_admin (CRITICAL - Full Rewrite)
  - Added search_path pinning
  - Added hard authorization check (super_admin only)
  - Added operation whitelist (DELETE only)
  
  ### Part 2: Functions with config = null (21 functions)
  - Added SET search_path = public, pg_temp
  
  ### Part 3: Functions with search_path=public (14 functions)
  - Updated to search_path = public, pg_temp
  
  ## Safety Notes
  - ⚠️ NO logic changes except execute_sql_as_admin
  - ⚠️ NO function deletions
  - ⚠️ NO changes to financial calculations
  - ✅ All functions preserve original behavior
*/


-- ============================================================================
-- PART 1: CRITICAL - execute_sql_as_admin (Full Rewrite with Authorization)
-- ============================================================================

CREATE OR REPLACE FUNCTION execute_sql_as_admin(sql_query TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected_count INTEGER;
  user_role TEXT;
BEGIN
  -- Hard Authorization Check: Only super_admin can execute
  SELECT role INTO user_role
  FROM public.users
  WHERE id = auth.uid();
  
  IF user_role IS NULL OR user_role != 'super_admin' THEN
    RAISE EXCEPTION 'Access Denied: Only super_admin can execute SQL';
  END IF;
  
  -- Only allow DELETE statements for safety
  IF sql_query !~* '^DELETE FROM' THEN
    RAISE EXCEPTION 'Only DELETE statements are allowed';
  END IF;
  
  -- Additional safety: Prevent dangerous operations
  IF sql_query ~* '(DROP|ALTER|TRUNCATE|GRANT|REVOKE)' THEN
    RAISE EXCEPTION 'Dangerous operations are not allowed';
  END IF;
  
  -- Execute the query and get affected row count
  EXECUTE sql_query;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  
  RETURN affected_count;
END;
$$;

COMMENT ON FUNCTION execute_sql_as_admin IS 'Executes DELETE queries with admin privileges. HARDENED: super_admin only, search_path pinned, whitelist enforced.';


-- ============================================================================
-- PART 2: Functions with config = null (Add search_path = public, pg_temp)
-- ============================================================================

-- Journal Posting Functions (3)
ALTER FUNCTION auto_post_sale_journal() SET search_path = public, pg_temp;
ALTER FUNCTION auto_post_purchase_journal() SET search_path = public, pg_temp;
ALTER FUNCTION auto_post_expense_journal() SET search_path = public, pg_temp;

-- Audit Trail (1)
ALTER FUNCTION log_audit_trail() SET search_path = public, pg_temp;

-- Commission Functions (4)
ALTER FUNCTION calculate_commission_on_sale() SET search_path = public, pg_temp;
ALTER FUNCTION calculate_sale_commission() SET search_path = public, pg_temp;
ALTER FUNCTION void_commission_on_sale_cancel() SET search_path = public, pg_temp;
ALTER FUNCTION void_sale_commission() SET search_path = public, pg_temp;

-- Loyalty Functions (1)
ALTER FUNCTION add_loyalty_points_transaction(UUID, UUID, INTEGER, TEXT) SET search_path = public, pg_temp;

-- Payroll Functions (5)
ALTER FUNCTION create_expense_on_payroll_posted() SET search_path = public, pg_temp;
ALTER FUNCTION create_journal_entry_on_payroll_paid() SET search_path = public, pg_temp;
ALTER FUNCTION create_payroll_run(INTEGER, INTEGER, UUID, UUID) SET search_path = public, pg_temp;
ALTER FUNCTION recalculate_payroll_totals() SET search_path = public, pg_temp;
ALTER FUNCTION get_active_compensation_plan(UUID, DATE) SET search_path = public, pg_temp;

-- Locking (1)
ALTER FUNCTION enforce_optimistic_lock() SET search_path = public, pg_temp;

-- Journal Entry Functions (2)
ALTER FUNCTION generate_journal_entry_number() SET search_path = public, pg_temp;
ALTER FUNCTION get_trial_balance(DATE, DATE, UUID) SET search_path = public, pg_temp;

-- Reporting Functions (2)
ALTER FUNCTION get_branch_stock_summary(UUID) SET search_path = public, pg_temp;
ALTER FUNCTION get_consolidated_sales_summary(DATE, DATE) SET search_path = public, pg_temp;

-- Customer Stats (2)
ALTER FUNCTION recalculate_all_customer_stats() SET search_path = public, pg_temp;
ALTER FUNCTION update_customer_stats_after_sale() SET search_path = public, pg_temp;


-- ============================================================================
-- PART 3: Functions with search_path=public (Update to include pg_temp)
-- ============================================================================

-- Void Functions (5)
ALTER FUNCTION void_sale(UUID, TEXT) RESET search_path;
ALTER FUNCTION void_sale(UUID, TEXT) SET search_path = public, pg_temp;

ALTER FUNCTION void_purchase(UUID, TEXT) RESET search_path;
ALTER FUNCTION void_purchase(UUID, TEXT) SET search_path = public, pg_temp;

ALTER FUNCTION void_expense(UUID, TEXT) RESET search_path;
ALTER FUNCTION void_expense(UUID, TEXT) SET search_path = public, pg_temp;

ALTER FUNCTION void_operating_expense(UUID, TEXT) RESET search_path;
ALTER FUNCTION void_operating_expense(UUID, TEXT) SET search_path = public, pg_temp;

ALTER FUNCTION void_setup_expense(UUID, TEXT) RESET search_path;
ALTER FUNCTION void_setup_expense(UUID, TEXT) SET search_path = public, pg_temp;

-- Status Update Functions (2)
ALTER FUNCTION update_sale_status(UUID, TEXT, TEXT) RESET search_path;
ALTER FUNCTION update_sale_status(UUID, TEXT, TEXT) SET search_path = public, pg_temp;

ALTER FUNCTION update_purchase_status(UUID, TEXT, TEXT) RESET search_path;
ALTER FUNCTION update_purchase_status(UUID, TEXT, TEXT) SET search_path = public, pg_temp;

ALTER FUNCTION handle_sale_status_change() RESET search_path;
ALTER FUNCTION handle_sale_status_change() SET search_path = public, pg_temp;

-- Authorization Helper Functions (3)
ALTER FUNCTION is_super_admin() RESET search_path;
ALTER FUNCTION is_super_admin() SET search_path = public, pg_temp;

ALTER FUNCTION get_my_role() RESET search_path;
ALTER FUNCTION get_my_role() SET search_path = public, pg_temp;

ALTER FUNCTION get_user_branch_id() RESET search_path;
ALTER FUNCTION get_user_branch_id() SET search_path = public, pg_temp;

-- Customer Functions (3)
ALTER FUNCTION update_customer_classification_tags() RESET search_path;
ALTER FUNCTION update_customer_classification_tags() SET search_path = public, pg_temp;

ALTER FUNCTION update_customer_metrics_on_sale() RESET search_path;
ALTER FUNCTION update_customer_metrics_on_sale() SET search_path = public, pg_temp;

ALTER FUNCTION fix_customer_metrics_for_existing_data() RESET search_path;
ALTER FUNCTION fix_customer_metrics_for_existing_data() SET search_path = public, pg_temp;


-- ============================================================================
-- Verification Comments
-- ============================================================================

COMMENT ON FUNCTION auto_post_sale_journal IS 'SECURITY HARDENED: search_path pinned';
COMMENT ON FUNCTION auto_post_purchase_journal IS 'SECURITY HARDENED: search_path pinned';
COMMENT ON FUNCTION auto_post_expense_journal IS 'SECURITY HARDENED: search_path pinned';
COMMENT ON FUNCTION log_audit_trail IS 'SECURITY HARDENED: search_path pinned';
COMMENT ON FUNCTION void_sale IS 'SECURITY HARDENED: search_path pinned';
COMMENT ON FUNCTION void_purchase IS 'SECURITY HARDENED: search_path pinned';
COMMENT ON FUNCTION void_expense IS 'SECURITY HARDENED: search_path pinned';
COMMENT ON FUNCTION calculate_commission_on_sale IS 'SECURITY HARDENED: search_path pinned';
COMMENT ON FUNCTION calculate_sale_commission IS 'SECURITY HARDENED: search_path pinned';
