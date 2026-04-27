/*
  # Revoke EXECUTE on RLS helper functions from authenticated

  1. Changes
    - Fixes get_branch_stock_summary and get_consolidated_sales_summary to
      inline the super_admin/branch check instead of calling is_super_admin()
    - Revokes EXECUTE from authenticated on all 17 RLS helper functions
    - These functions are only used inside RLS policy expressions, which are
      evaluated by the table owner (postgres), not the calling role

  2. Functions affected
    - fn_is_super_admin, fn_is_admin_or_super, fn_get_my_role, get_my_role,
      get_user_role, get_user_branch_id, is_super_admin, fn_is_company_admin,
      fn_is_company_manager, fn_is_current_user_super_admin,
      fn_is_period_locked_for_user, fn_get_user_company_id,
      fn_get_user_company_ids, fn_get_user_company_role,
      fn_user_has_branch_access, fn_user_has_company_access,
      check_user_permission

  3. Security
    - These functions can no longer be called directly via RPC
    - RLS policies continue to work since they execute as the table owner
*/

-- ============================================================
-- Fix get_branch_stock_summary: inline is_super_admin check
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_branch_stock_summary(p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(branch_id uuid, branch_name text, total_products bigint, low_stock_items bigint, out_of_stock_items bigint, total_stock_value numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
v_branch_id uuid;
v_is_super boolean;
BEGIN
SELECT EXISTS(SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin') INTO v_is_super;
v_branch_id := COALESCE(p_branch_id, (SELECT branch_id FROM users WHERE id = auth.uid()));

IF p_branch_id IS NULL AND NOT v_is_super THEN
  v_branch_id := (SELECT branch_id FROM users WHERE id = auth.uid());
END IF;

RETURN QUERY
SELECT 
b.id as branch_id,
b.name as branch_name,
COUNT(DISTINCT bs.product_id) as total_products,
COUNT(DISTINCT bs.product_id) FILTER (WHERE bs.quantity <= bs.min_stock_level AND bs.quantity > 0) as low_stock_items,
COUNT(DISTINCT bs.product_id) FILTER (WHERE bs.quantity = 0) as out_of_stock_items,
COALESCE(SUM(bs.quantity * p.sale_price), 0) as total_stock_value
FROM branches b
LEFT JOIN branch_stock bs ON bs.branch_id = b.id
LEFT JOIN products p ON p.id = bs.product_id
WHERE 
b.is_active = true
AND (v_branch_id IS NULL OR b.id = v_branch_id)
GROUP BY b.id, b.name
ORDER BY b.name;
END;
$function$;

-- ============================================================
-- Fix get_consolidated_sales_summary: inline is_super_admin check
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_consolidated_sales_summary(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date)
 RETURNS TABLE(branch_id uuid, branch_name text, total_sales numeric, total_orders bigint, avg_order_value numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
IF NOT EXISTS(SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin') THEN
  RAISE EXCEPTION 'Access denied. Super admin privileges required.';
END IF;

RETURN QUERY
SELECT 
b.id as branch_id,
b.name as branch_name,
COALESCE(SUM(s.total), 0) as total_sales,
COUNT(s.id) as total_orders,
COALESCE(AVG(s.total), 0) as avg_order_value
FROM branches b
LEFT JOIN sales s ON s.branch_id = b.id
WHERE 
b.is_active = true
AND (p_start_date IS NULL OR s.sale_date >= p_start_date)
AND (p_end_date IS NULL OR s.sale_date <= p_end_date)
GROUP BY b.id, b.name
ORDER BY total_sales DESC;
END;
$function$;

-- ============================================================
-- Revoke EXECUTE from authenticated on all RLS helper functions
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.fn_is_super_admin() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_is_admin_or_super() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_get_my_role() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_branch_id() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_is_company_admin(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_is_company_manager(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_is_current_user_super_admin() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_is_period_locked_for_user(date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_get_user_company_id() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_get_user_company_ids() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_get_user_company_role(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_user_has_branch_access(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_user_has_company_access(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.check_user_permission(text, text) FROM authenticated;
