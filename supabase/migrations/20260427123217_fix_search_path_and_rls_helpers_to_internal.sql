/*
  # Fix mutable search_path on INVOKER wrappers and move RLS helpers to internal

  1. Search Path Fix (27 functions):
    - All INVOKER wrapper functions created in previous migrations lack
      an explicit `search_path` setting. The scanner flags them as
      "Function Search Path Mutable". Fix: SET search_path TO 'public'.

  2. RLS Helper Functions (4 functions):
    - `fn_is_super_admin()`, `fn_is_admin_or_super()`, `fn_is_company_admin(uuid)`,
      `fn_get_user_company_ids()` are SECURITY DEFINER in public schema.
    - They cannot be dropped (RLS policies depend on them).
    - Fix: Create DEFINER copies in `internal` schema, then use
      CREATE OR REPLACE + ALTER FUNCTION to convert public versions
      to SECURITY INVOKER wrappers.
*/

-- ============================================================
-- PART 1: Fix search_path on 27 INVOKER wrapper functions
-- ============================================================

ALTER FUNCTION public.lookup_auth_email_by_username(text) SET search_path TO 'public';
ALTER FUNCTION public.fn_log_error(text,text,text,text,text,text,text,text,jsonb,jsonb) SET search_path TO 'public';
ALTER FUNCTION public.fn_resolve_error(uuid,text) SET search_path TO 'public';
ALTER FUNCTION public.void_journal_entry(uuid) SET search_path TO 'public';
ALTER FUNCTION public.void_partner_settlement(uuid,text) SET search_path TO 'public';
ALTER FUNCTION public.void_expense(uuid,text) SET search_path TO 'public';
ALTER FUNCTION public.void_sale(uuid,text) SET search_path TO 'public';
ALTER FUNCTION public.void_partner_operation_atomic(uuid,text) SET search_path TO 'public';
ALTER FUNCTION public.upsert_user_permissions(uuid,jsonb) SET search_path TO 'public';
ALTER FUNCTION public.add_custody_settlement_atomic(uuid,text,numeric,text,text,text,date,text,uuid) SET search_path TO 'public';
ALTER FUNCTION public.approve_payroll_run(uuid) SET search_path TO 'public';
ALTER FUNCTION public.assign_branch_to_user(uuid,uuid) SET search_path TO 'public';
ALTER FUNCTION public.cancel_draft_payroll_run(uuid,text) SET search_path TO 'public';
ALTER FUNCTION public.create_employee_custody_atomic(uuid,uuid,numeric,text,uuid,text,text,text,date) SET search_path TO 'public';
ALTER FUNCTION public.fn_close_accounting_period(uuid,text) SET search_path TO 'public';
ALTER FUNCTION public.fn_distribute_monthly_profit(integer,integer,uuid) SET search_path TO 'public';
ALTER FUNCTION public.fn_record_partner_withdrawal(uuid,numeric,text,text,text,date,uuid) SET search_path TO 'public';
ALTER FUNCTION public.fn_renew_iqama(uuid,integer,date) SET search_path TO 'public';
ALTER FUNCTION public.fn_super_admin_update_setup_expense(uuid,numeric,date,text,text,text,uuid,text) SET search_path TO 'public';
ALTER FUNCTION public.create_sale_atomic(jsonb) SET search_path TO 'public';
ALTER FUNCTION public.generate_depreciation_entries(date) SET search_path TO 'public';
ALTER FUNCTION public.generate_payroll_run(uuid,integer,integer) SET search_path TO 'public';
ALTER FUNCTION public.pay_payroll_run(uuid,text) SET search_path TO 'public';
ALTER FUNCTION public.perform_atomic_restore(jsonb) SET search_path TO 'public';
ALTER FUNCTION public.process_purchase_receipt_atomic(uuid) SET search_path TO 'public';
ALTER FUNCTION public.update_purchase_status(uuid,text,text) SET search_path TO 'public';
ALTER FUNCTION public.update_sale_status(uuid,text,text) SET search_path TO 'public';

-- ============================================================
-- PART 2: Move 4 RLS helper DEFINER functions to internal
-- ============================================================

-- 2a. Create DEFINER copies in internal schema
-- (fn_is_super_admin and fn_is_admin_or_super already exist in internal from batch1 attempt)

CREATE OR REPLACE FUNCTION internal.fn_is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
SELECT EXISTS (
  SELECT 1 FROM users
  WHERE id = auth.uid()
  AND role = 'super_admin'
);
$$;

CREATE OR REPLACE FUNCTION internal.fn_is_admin_or_super()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
SELECT EXISTS (
  SELECT 1 FROM users
  WHERE id = auth.uid()
  AND role IN ('admin', 'super_admin')
);
$$;

CREATE OR REPLACE FUNCTION internal.fn_is_company_admin(p_company_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
BEGIN
IF EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin') THEN
  RETURN true;
END IF;
RETURN EXISTS (
  SELECT 1 FROM company_members
  WHERE user_id = auth.uid()
  AND company_id = p_company_id
  AND company_role IN ('owner', 'admin')
  AND is_active = true
);
END;
$fn$;

CREATE OR REPLACE FUNCTION internal.fn_get_user_company_ids()
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
BEGIN
IF EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin') THEN
  RETURN QUERY SELECT id FROM companies WHERE is_active = true;
ELSE
  RETURN QUERY SELECT company_id FROM company_members WHERE user_id = auth.uid() AND is_active = true;
END IF;
END;
$fn$;

GRANT EXECUTE ON FUNCTION internal.fn_is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION internal.fn_is_admin_or_super() TO authenticated;
GRANT EXECUTE ON FUNCTION internal.fn_is_company_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION internal.fn_get_user_company_ids() TO authenticated;

-- 2b. Replace public DEFINER functions with INVOKER wrappers
-- Using CREATE OR REPLACE preserves dependent RLS policies

-- fn_is_super_admin: SQL -> SQL, same return type
CREATE OR REPLACE FUNCTION public.fn_is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
SELECT internal.fn_is_super_admin();
$$;

ALTER FUNCTION public.fn_is_super_admin() SECURITY INVOKER;

-- fn_is_admin_or_super: SQL -> SQL, same return type
CREATE OR REPLACE FUNCTION public.fn_is_admin_or_super()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
SELECT internal.fn_is_admin_or_super();
$$;

ALTER FUNCTION public.fn_is_admin_or_super() SECURITY INVOKER;

-- fn_is_company_admin: plpgsql -> sql, same return type
CREATE OR REPLACE FUNCTION public.fn_is_company_admin(p_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
SELECT internal.fn_is_company_admin(p_company_id);
$$;

ALTER FUNCTION public.fn_is_company_admin(uuid) SECURITY INVOKER;

-- fn_get_user_company_ids: plpgsql -> plpgsql (SETOF uuid needs plpgsql wrapper)
CREATE OR REPLACE FUNCTION public.fn_get_user_company_ids()
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $fn$
BEGIN
  RETURN QUERY SELECT internal.fn_get_user_company_ids();
END;
$fn$;

ALTER FUNCTION public.fn_get_user_company_ids() SECURITY INVOKER;

-- Ensure EXECUTE is granted on the INVOKER wrappers
GRANT EXECUTE ON FUNCTION public.fn_is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_is_admin_or_super() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_is_company_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_user_company_ids() TO authenticated;
