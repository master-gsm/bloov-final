/*
  # Security Fix: Revoke Public Access to Materialized View

  1. Security Issue
    - Materialized view `mv_gl_monthly_balances` contains sensitive financial data
    - Currently accessible by `anon` and `authenticated` roles
    - This violates principle of least privilege for financial reporting

  2. Changes
    - Revoke SELECT from `anon` role (anonymous users should never see financial data)
    - Revoke SELECT from `authenticated` role (not all authenticated users need direct access)
    - Keep access only for `service_role` and `postgres` (admin operations)
    - Create secure RPC function for authorized access with RLS checks

  3. Security
    - Financial data now requires explicit authorization
    - Access controlled through secure RPC function
    - Branch isolation enforced via RLS checks
    - Role-based access control (admin/accountant only)

  4. Impact
    - No frontend impact (view not used directly in code)
    - Reports will use secure RPC function instead
    - Performance maintained via materialized view caching
*/

-- Step 1: Revoke dangerous public access
REVOKE ALL ON public.mv_gl_monthly_balances FROM anon;
REVOKE ALL ON public.mv_gl_monthly_balances FROM authenticated;

-- Step 2: Ensure only service_role and postgres have access
GRANT SELECT ON public.mv_gl_monthly_balances TO service_role;

-- Step 3: Create secure RPC function for authorized access
CREATE OR REPLACE FUNCTION public.get_gl_monthly_balances(
  p_branch_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_account_type text DEFAULT NULL
)
RETURNS TABLE (
  branch_id uuid,
  period_month date,
  account_id uuid,
  account_code text,
  account_type text,
  account_name text,
  account_name_ar text,
  total_debit numeric,
  total_credit numeric,
  net_movement numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_role text;
  v_user_branch_id uuid;
BEGIN
  -- Security: Get user role and branch
  SELECT role, branch_id INTO v_user_role, v_user_branch_id
  FROM users
  WHERE auth_id = auth.uid();

  -- Security: Only admin and accountant can access financial reports
  IF v_user_role NOT IN ('admin', 'accountant', 'super_admin') THEN
    RAISE EXCEPTION 'Access denied: insufficient privileges for financial reports';
  END IF;

  -- Security: Branch isolation (unless super_admin)
  IF v_user_role != 'super_admin' AND p_branch_id IS NOT NULL AND p_branch_id != v_user_branch_id THEN
    RAISE EXCEPTION 'Access denied: cannot access other branch data';
  END IF;

  -- Apply branch filter for non-super_admin users
  IF v_user_role != 'super_admin' THEN
    p_branch_id := COALESCE(p_branch_id, v_user_branch_id);
  END IF;

  -- Return filtered data from materialized view
  RETURN QUERY
  SELECT
    mv.branch_id,
    mv.period_month,
    mv.account_id,
    mv.account_code,
    mv.account_type,
    mv.account_name,
    mv.account_name_ar,
    mv.total_debit,
    mv.total_credit,
    mv.net_movement
  FROM public.mv_gl_monthly_balances mv
  WHERE (p_branch_id IS NULL OR mv.branch_id = p_branch_id)
    AND (p_start_date IS NULL OR mv.period_month >= p_start_date)
    AND (p_end_date IS NULL OR mv.period_month <= p_end_date)
    AND (p_account_type IS NULL OR mv.account_type = p_account_type)
  ORDER BY mv.period_month DESC, mv.account_code;
END;
$$;

-- Step 4: Grant execute on RPC function to authenticated users
-- (RLS checks inside function will enforce authorization)
GRANT EXECUTE ON FUNCTION public.get_gl_monthly_balances TO authenticated;

-- Step 5: Add comment for documentation
COMMENT ON MATERIALIZED VIEW public.mv_gl_monthly_balances IS 
'Internal materialized view for financial reporting performance. 
Do NOT grant direct SELECT access to anon or authenticated roles.
Access must go through secure RPC function get_gl_monthly_balances() which enforces RLS.';

COMMENT ON FUNCTION public.get_gl_monthly_balances IS
'Secure access to GL monthly balances with role-based and branch-based authorization.
Only admin/accountant roles can access. Branch isolation enforced for non-super_admin.';
