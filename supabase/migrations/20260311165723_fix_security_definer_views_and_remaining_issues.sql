/*
  # Fix Security Definer Views, Mutable Search Path, and Always-True RLS

  1. Security - Views
    - Recreates 4 views with SECURITY INVOKER instead of SECURITY DEFINER
    - SECURITY DEFINER views run with the view owner's permissions, bypassing RLS
    - SECURITY INVOKER ensures the calling user's permissions are respected
    - Views: v_accounting_periods_status, v_audit_logs_detailed,
      v_security_audit_events, v_error_dashboard

  2. Security - Function Search Path
    - Fixes calculate_account_balance to have immutable search_path set to 'public'
    - Prevents search_path manipulation attacks

  3. Security - RLS Always True
    - Replaces error_logs_insert_any policy (WITH CHECK = true) with a proper
      check that only authenticated users can insert error logs

  4. Important Notes
    - Views are dropped and recreated (no data loss since views contain no data)
    - Function is replaced in-place
*/

-- 1. Fix SECURITY DEFINER views -> SECURITY INVOKER

DROP VIEW IF EXISTS public.v_accounting_periods_status;
CREATE VIEW public.v_accounting_periods_status
WITH (security_invoker = true)
AS
SELECT ap.id,
    ap.name,
    ap.start_date,
    ap.end_date,
    ap.is_closed,
    ap.status,
    ap.closed_at,
    u.full_name AS closed_by_name,
    (SELECT count(*) FROM journal_entries je
     WHERE je.date >= ap.start_date AND je.date <= ap.end_date) AS total_entries,
    (SELECT count(*) FROM journal_entries je
     WHERE je.date >= ap.start_date AND je.date <= ap.end_date
     AND je.status::text = 'Posted') AS posted_entries,
    (SELECT count(*) FROM journal_entries je
     WHERE je.date >= ap.start_date AND je.date <= ap.end_date
     AND je.status::text <> 'Posted') AS unposted_entries,
    (SELECT COALESCE(sum(jl.debit), 0)
     FROM journal_entries je JOIN journal_lines jl ON jl.journal_entry_id = je.id
     WHERE je.date >= ap.start_date AND je.date <= ap.end_date
     AND je.status::text = 'Posted') AS total_debits,
    (SELECT count(*) FROM sales s
     WHERE s.sale_date >= ap.start_date AND s.sale_date <= ap.end_date) AS sales_count,
    (SELECT count(*) FROM purchases p
     WHERE p.purchase_date >= ap.start_date AND p.purchase_date <= ap.end_date) AS purchases_count
FROM accounting_periods ap
LEFT JOIN users u ON u.id = ap.closed_by
ORDER BY ap.start_date DESC;

DROP VIEW IF EXISTS public.v_audit_logs_detailed;
CREATE VIEW public.v_audit_logs_detailed
WITH (security_invoker = true)
AS
SELECT al.id,
    al.created_at,
    al.action,
    al.table_name,
    al.record_id,
    u.full_name AS user_name,
    u.role AS user_role,
    b.name AS branch_name,
    al.old_data,
    al.new_data,
    al.metadata,
    CASE
        WHEN al.action ~~ '%DELETE%' OR al.action ~~ '%VOID%' THEN 'danger'
        WHEN al.action ~~ '%UPDATE%' OR al.action ~~ '%MODIFY%' THEN 'warning'
        WHEN al.action ~~ '%CREATE%' OR al.action ~~ '%INSERT%' THEN 'success'
        ELSE 'info'
    END AS severity
FROM audit_logs al
LEFT JOIN users u ON u.id = al.user_id
LEFT JOIN branches b ON b.id = al.branch_id
ORDER BY al.created_at DESC;

DROP VIEW IF EXISTS public.v_security_audit_events;
CREATE VIEW public.v_security_audit_events
WITH (security_invoker = true)
AS
SELECT al.id,
    al.created_at,
    al.action,
    al.table_name,
    al.record_id,
    u.full_name AS user_name,
    al.metadata
FROM audit_logs al
LEFT JOIN users u ON u.id = al.user_id
WHERE al.action = ANY (ARRAY[
    'PERIOD_CLOSED','PERIOD_REOPENED','VOID_SALE','VOID_PURCHASE',
    'VOID_EXPENSE','CREATE_USERS','UPDATE_USERS','DELETE_USERS',
    'STATUS_CHANGE','ROLE_CHANGE','LOGIN_FAILED','PASSWORD_RESET'
  ])
  OR al.table_name = 'users'
ORDER BY al.created_at DESC;

DROP VIEW IF EXISTS public.v_error_dashboard;
CREATE VIEW public.v_error_dashboard
WITH (security_invoker = true)
AS
SELECT e.id,
    e.error_code,
    e.error_message,
    e.error_type,
    e.severity,
    e.component,
    e.occurrence_count,
    e.first_seen_at,
    e.last_seen_at,
    e.is_resolved,
    e.resolved_at,
    u.full_name AS affected_user,
    b.name AS branch_name,
    r.full_name AS resolved_by_name,
    e.resolution_notes,
    CASE
        WHEN e.severity = 'critical' THEN 1
        WHEN e.severity = 'error' THEN 2
        WHEN e.severity = 'warning' THEN 3
        ELSE 4
    END AS severity_order
FROM error_logs e
LEFT JOIN users u ON u.id = e.user_id
LEFT JOIN branches b ON b.id = e.branch_id
LEFT JOIN users r ON r.id = e.resolved_by
ORDER BY e.is_resolved,
    CASE
        WHEN e.severity = 'critical' THEN 1
        WHEN e.severity = 'error' THEN 2
        WHEN e.severity = 'warning' THEN 3
        ELSE 4
    END,
    e.last_seen_at DESC;

-- 2. Fix mutable search_path on calculate_account_balance
CREATE OR REPLACE FUNCTION public.calculate_account_balance(
  p_account_type text,
  p_total_debit numeric,
  p_total_credit numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = 'public'
AS $function$
BEGIN
  IF p_account_type IN ('asset', 'expense') THEN
    RETURN COALESCE(p_total_debit, 0) - COALESCE(p_total_credit, 0);
  ELSIF p_account_type IN ('liability', 'equity', 'revenue') THEN
    RETURN COALESCE(p_total_credit, 0) - COALESCE(p_total_debit, 0);
  ELSE
    RETURN COALESCE(p_total_debit, 0) - COALESCE(p_total_credit, 0);
  END IF;
END;
$function$;

-- 3. Fix error_logs_insert_any (always-true WITH CHECK)
DROP POLICY IF EXISTS "error_logs_insert_any" ON public.error_logs;
CREATE POLICY "error_logs_insert_authenticated" ON public.error_logs
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);
