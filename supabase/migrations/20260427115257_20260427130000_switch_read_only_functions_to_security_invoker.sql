/*
  # Switch read-only functions to SECURITY INVOKER

  1. Changes
    - Converts ~35 read-only reporting, calculation, and diagnostic functions
      from SECURITY DEFINER to SECURITY INVOKER
    - These functions only perform SELECT queries and do not access auth.users
    - All underlying tables have SELECT RLS policies for authenticated users

  2. Functions NOT converted (must remain DEFINER)
    - RLS helper functions (fn_is_super_admin, fn_is_admin_or_super, etc.) -- used inside
      RLS policies on the users table itself; switching would cause infinite recursion
    - Functions that write to tables (create_sale_atomic, void_sale, etc.)
    - Functions that access auth.users (lookup_auth_email_by_username, get_auth_email_by_user_id)
    - lookup_auth_email_by_username also needs anon access for login flow

  3. Security
    - These functions now execute under the caller's permissions
    - RLS policies on underlying tables enforce data isolation
    - No change in functionality for authorized users
*/

-- ============================================================
-- Reporting functions (all read-only, no auth.users access)
-- ============================================================

ALTER FUNCTION public.get_financial_summary(date, date, uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_financial_summary_secure(date, date, uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_income_statement(uuid, date, date) SECURITY INVOKER;
ALTER FUNCTION public.get_income_statement_v2(uuid, date, date) SECURITY INVOKER;
ALTER FUNCTION public.get_balance_sheet(uuid, date) SECURITY INVOKER;
ALTER FUNCTION public.get_balance_sheet_v2(uuid, date) SECURITY INVOKER;
ALTER FUNCTION public.get_trial_balance(uuid, date, date) SECURITY INVOKER;
ALTER FUNCTION public.get_trial_balance(date, date, uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_trial_balance_v2(uuid, date, date) SECURITY INVOKER;
ALTER FUNCTION public.get_cash_flow_statement(uuid, date, date) SECURITY INVOKER;
ALTER FUNCTION public.get_gl_monthly_balances(uuid, date, date, text) SECURITY INVOKER;
ALTER FUNCTION public.get_ar_aging(uuid, date) SECURITY INVOKER;
ALTER FUNCTION public.get_ap_aging(uuid, date) SECURITY INVOKER;
ALTER FUNCTION public.get_dso(uuid, date, date) SECURITY INVOKER;
ALTER FUNCTION public.get_bank_reconciliation_summary(uuid, date) SECURITY INVOKER;
ALTER FUNCTION public.get_consolidated_sales_summary(date, date) SECURITY INVOKER;
ALTER FUNCTION public.get_vat_summary(uuid, integer, integer) SECURITY INVOKER;
ALTER FUNCTION public.verify_gl_balance(uuid, date) SECURITY INVOKER;
ALTER FUNCTION public.get_db_health_report() SECURITY INVOKER;

-- ============================================================
-- Inventory/stock read-only functions
-- ============================================================

ALTER FUNCTION public.get_branch_stock_summary(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_open_cash_register() SECURITY INVOKER;
ALTER FUNCTION public.get_register_current_balance(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_employee_open_custodies(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_total_depreciation_for_period(date, date, uuid) SECURITY INVOKER;

-- ============================================================
-- Pure calculation functions (no writes, no auth.users)
-- ============================================================

ALTER FUNCTION public.calculate_customer_tier(numeric, integer, timestamptz) SECURITY INVOKER;
ALTER FUNCTION public.calculate_customer_tier(numeric, integer, integer) SECURITY INVOKER;
ALTER FUNCTION public.calculate_valid_loyalty_points(uuid) SECURITY INVOKER;
ALTER FUNCTION public.calculate_monthly_depreciation(uuid) SECURITY INVOKER;
ALTER FUNCTION public.calculate_shift_expected_balance(uuid) SECURITY INVOKER;
ALTER FUNCTION public.calculate_salla_sales(date, date) SECURITY INVOKER;
ALTER FUNCTION public.calculate_wastage_cost(date, date) SECURITY INVOKER;

-- ============================================================
-- HR read-only functions
-- ============================================================

ALTER FUNCTION public.get_active_compensation_plan(uuid, date) SECURITY INVOKER;
ALTER FUNCTION public.calculate_end_of_service(uuid, date, text) SECURITY INVOKER;

-- ============================================================
-- Audit/diagnostic read-only functions
-- ============================================================

ALTER FUNCTION public.fn_get_alerts(text) SECURITY INVOKER;
ALTER FUNCTION public.fn_get_audit_summary(date, date) SECURITY INVOKER;
ALTER FUNCTION public.fn_get_error_stats(integer) SECURITY INVOKER;
ALTER FUNCTION public.validate_restore_readiness() SECURITY INVOKER;

-- ============================================================
-- Test/diagnostic functions (read-only)
-- ============================================================

ALTER FUNCTION public.test_partner_operation_integrity(uuid) SECURITY INVOKER;
ALTER FUNCTION public.test_purchase_receipt_integrity(uuid) SECURITY INVOKER;

-- ============================================================
-- Permission check functions that DON'T read from users table
-- (These are safe because they read from user_permissions / company_members
-- which have their own RLS policies)
-- ============================================================

ALTER FUNCTION public.get_user_permissions(uuid) SECURITY INVOKER;
ALTER FUNCTION public.fn_get_company_from_branch(uuid) SECURITY INVOKER;
ALTER FUNCTION public.fn_is_period_locked(date) SECURITY INVOKER;
ALTER FUNCTION public.fn_get_locked_period_name(date) SECURITY INVOKER;
ALTER FUNCTION public.fn_can_manage_company_data(uuid) SECURITY INVOKER;
