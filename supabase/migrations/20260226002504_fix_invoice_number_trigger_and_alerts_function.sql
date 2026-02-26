/*
  # Fix: Drop broken invoice_number trigger and fix fn_get_alerts

  1. Changes
    - Drop `trg_assign_invoice_number` trigger on `sales` table
      - This trigger references `NEW.invoice_number` but the column is `sale_number`
      - The `create_sale_atomic()` function already generates sale_number directly, so this trigger is redundant and broken
    - Drop `fn_assign_invoice_number()` function that is no longer needed
    - Fix `fn_get_alerts()` function
      - Replace `cs.start_time` with `cs.opened_at` (correct column name in `cash_shifts` table)

  2. Why
    - `trg_assign_invoice_number` causes: "record 'new' has no field 'invoice_number'" on every sale insert
    - `fn_get_alerts` causes: "column cs.start_time does not exist" when loading alerts

  3. Safety
    - No data changes, only trigger/function fixes
    - Sale number generation is handled by `create_sale_atomic()` so removing the trigger has no side effects
*/

-- 1. Drop the broken trigger first, then the function
DROP TRIGGER IF EXISTS trg_assign_invoice_number ON sales;
DROP FUNCTION IF EXISTS fn_assign_invoice_number();

-- 2. Fix fn_get_alerts: replace cs.start_time with cs.opened_at
CREATE OR REPLACE FUNCTION public.fn_get_alerts(p_role text DEFAULT 'admin'::text)
 RETURNS TABLE(alert_id text, type text, severity text, title text, title_ar text, message text, message_ar text, reference_type text, reference_id text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_today date := CURRENT_DATE;
v_branch_id uuid;
BEGIN
SELECT branch_id INTO v_branch_id FROM users WHERE id = auth.uid();

IF p_role IN ('admin', 'hr') THEN
RETURN QUERY
SELECT
'iqama_' || e.id::text,
'iqama_expiry'::text,
CASE
WHEN e.iqama_expiry_date < v_today THEN 'urgent'
WHEN e.iqama_expiry_date < v_today + INTERVAL '30 days' THEN 'critical'
ELSE 'warning'
END,
'Iqama Expiry: ' || e.full_name,
'انتهاء إقامة: ' || COALESCE(e.full_name_ar, e.full_name),
CASE
WHEN e.iqama_expiry_date < v_today
THEN 'Iqama expired on ' || to_char(e.iqama_expiry_date, 'DD Mon YYYY')
ELSE 'Iqama expires on ' || to_char(e.iqama_expiry_date, 'DD Mon YYYY') || ' (' || (e.iqama_expiry_date - v_today) || ' days)'
END,
CASE
WHEN e.iqama_expiry_date < v_today
THEN 'انتهت إقامة الموظف في ' || to_char(e.iqama_expiry_date, 'DD Mon YYYY')
ELSE 'تنتهي الإقامة في ' || to_char(e.iqama_expiry_date, 'DD Mon YYYY') || ' (بعد ' || (e.iqama_expiry_date - v_today) || ' يوم)'
END,
'employees'::text,
e.id::text,
now()
FROM employees e
WHERE
e.iqama_expiry_date IS NOT NULL
AND e.is_active = true
AND e.iqama_expiry_date < v_today + INTERVAL '60 days'
AND (v_branch_id IS NULL OR e.branch_id = v_branch_id OR p_role = 'admin');
END IF;

IF p_role IN ('admin', 'accountant') THEN
RETURN QUERY
SELECT
'payroll_' || to_char(date_trunc('month', now()), 'YYYY_MM'),
'payroll_missing'::text,
'warning'::text,
'Payroll not run for ' || to_char(now(), 'Month YYYY'),
'الرواتب لم تُصرف لشهر ' || to_char(now(), 'Month YYYY'),
'No payroll run has been created for the current month.',
'لم يتم إنشاء صرف رواتب للشهر الحالي.',
'payroll_runs'::text,
to_char(date_trunc('month', now()), 'YYYY-MM-DD'),
now()
WHERE NOT EXISTS (
SELECT 1 FROM payroll_runs
WHERE period_month = EXTRACT(MONTH FROM now())::int
AND period_year = EXTRACT(YEAR FROM now())::int
AND status != 'cancelled'
)
AND EXTRACT(DAY FROM now()) >= 20;

RETURN QUERY
SELECT
'draft_je_' || je.id::text,
'draft_journal'::text,
'warning'::text,
'Draft Journal Entry: ' || je.entry_number,
'قيد مؤقت: ' || je.entry_number,
'Journal entry ' || je.entry_number || ' has been in draft status for over 7 days.',
'القيد ' || je.entry_number || ' في حالة مسودة منذ أكثر من 7 أيام.',
'journal_entries'::text,
je.id::text,
now()
FROM journal_entries je
WHERE je.status = 'draft'
AND je.created_at < now() - INTERVAL '7 days'
AND (v_branch_id IS NULL OR je.branch_id = v_branch_id OR p_role = 'admin')
LIMIT 10;
END IF;

IF p_role IN ('admin', 'accountant', 'cashier') THEN
RETURN QUERY
SELECT
'shift_' || cs.id::text,
'open_shift'::text,
'critical'::text,
'Cash shift open > 24h',
'وردية مفتوحة منذ أكثر من 24 ساعة',
'Cash shift started at ' || to_char(cs.opened_at, 'DD Mon HH24:MI') || ' is still open.',
'وردية الصندوق بدأت في ' || to_char(cs.opened_at, 'DD Mon HH24:MI') || ' لا تزال مفتوحة.',
'cash_shifts'::text,
cs.id::text,
now()
FROM cash_shifts cs
WHERE cs.status = 'open'
AND cs.opened_at < now() - INTERVAL '24 hours'
AND (v_branch_id IS NULL OR cs.branch_id = v_branch_id OR p_role = 'admin')
LIMIT 5;
END IF;

IF p_role IN ('admin', 'accountant') THEN
RETURN QUERY
SELECT
'vat_quarter_' || to_char(date_trunc('quarter', now()), 'YYYY_Q'),
'vat_quarter'::text,
CASE
WHEN (date_trunc('quarter', now()) + INTERVAL '3 months' - now()) < INTERVAL '14 days' THEN 'critical'
ELSE 'warning'
END,
'VAT Quarter ending soon',
'اقتراب نهاية الربع الضريبي',
'Current VAT quarter ends on ' || to_char(date_trunc('quarter', now()) + INTERVAL '3 months - 1 day', 'DD Mon YYYY') || '.',
'ينتهي الربع الضريبي الحالي في ' || to_char(date_trunc('quarter', now()) + INTERVAL '3 months - 1 day', 'DD Mon YYYY') || '.',
'vat_returns'::text,
to_char(date_trunc('quarter', now()), 'YYYY-MM-DD'),
now()
WHERE (date_trunc('quarter', now()) + INTERVAL '3 months' - now()) < INTERVAL '30 days';

RETURN QUERY
SELECT
'vat_unsettled_' || vr.id::text,
'vat_unsettled'::text,
'warning'::text,
'Unsettled VAT return',
'إقرار ضريبي غير مسوّى',
'VAT return for period ' || to_char(vr.period_start, 'Mon YYYY') || ' has a net balance of ' || vr.net_vat_due::text || ' SAR.',
'الإقرار الضريبي للفترة ' || to_char(vr.period_start, 'Mon YYYY') || ' يحتوي على رصيد صافي ' || vr.net_vat_due::text || ' ر.س.',
'vat_returns'::text,
vr.id::text,
now()
FROM vat_returns vr
WHERE vr.status IN ('draft', 'submitted')
AND vr.net_vat_due != 0
AND vr.period_end < now() - INTERVAL '15 days'
LIMIT 5;
END IF;

IF p_role IN ('admin', 'accountant', 'salesperson') THEN
RETURN QUERY
SELECT
'low_stock_' || inv.product_id::text,
'low_stock'::text,
CASE WHEN inv.quantity <= 0 THEN 'urgent' ELSE 'warning' END,
'Low Stock: ' || p.name,
'مخزون منخفض: ' || COALESCE(p.name_ar, p.name),
'Product "' || p.name || '" has ' || inv.quantity || ' units remaining.',
'المنتج "' || COALESCE(p.name_ar, p.name) || '" متبقي منه ' || inv.quantity || ' وحدة.',
'products'::text,
p.id::text,
now()
FROM inventory inv
JOIN products p ON p.id = inv.product_id
WHERE inv.quantity <= COALESCE(p.min_stock_level, 5)
AND p.is_active = true
AND (v_branch_id IS NULL OR inv.branch_id = v_branch_id OR p_role = 'admin')
LIMIT 10;
END IF;

END;
$function$;
