/*
  # Critical Fix Patch

  1. Fix RLS "block direct sales insert" — set WITH CHECK (false) to actually block direct inserts
  2. Fix get_trial_balance — replace je.entry_date with je.date (correct column name)
  3. Fix get_vat_summary — replace vat_status with vat_status_snapshot (correct column name)
*/

-- ============================================================
-- 1. FIX RLS: block direct sales insert
-- ============================================================
DROP POLICY IF EXISTS "block direct sales insert" ON sales;

CREATE POLICY "block direct sales insert"
  ON sales
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- ============================================================
-- 2. FIX get_trial_balance: entry_date → date
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_trial_balance(
  p_start_date date DEFAULT NULL,
  p_end_date   date DEFAULT NULL,
  p_branch_id  uuid DEFAULT NULL
)
RETURNS TABLE(
  account_code  text,
  account_name  text,
  account_name_ar text,
  debit_total   numeric,
  credit_total  numeric,
  balance       numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    coa.account_code,
    coa.account_name,
    coa.account_name_ar,
    COALESCE(SUM(CASE WHEN jel.line_type = 'debit'  THEN jel.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN jel.line_type = 'debit'  THEN jel.amount ELSE -jel.amount END), 0)
  FROM chart_of_accounts coa
  LEFT JOIN journal_entry_lines jel ON jel.account_id = coa.id
  LEFT JOIN journal_entries      je  ON je.id = jel.journal_entry_id
  WHERE
    coa.is_active = true
    AND (p_start_date IS NULL OR je.date >= p_start_date)
    AND (p_end_date   IS NULL OR je.date <= p_end_date)
    AND (p_branch_id  IS NULL OR je.branch_id = p_branch_id)
    AND (je.status IS NULL OR je.status = 'posted')
  GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_name_ar
  ORDER BY coa.account_code;
END;
$$;

-- ============================================================
-- 3. FIX get_vat_summary: vat_status → vat_status_snapshot
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_vat_summary(
  p_branch_id uuid    DEFAULT NULL,
  p_month     integer DEFAULT NULL,
  p_year      integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_month          int  := COALESCE(p_month, EXTRACT(MONTH FROM CURRENT_DATE)::int);
  v_year           int  := COALESCE(p_year,  EXTRACT(YEAR  FROM CURRENT_DATE)::int);
  v_date_from      date;
  v_date_to        date;
  v_output_vat     numeric := 0;
  v_taxable_sales  numeric := 0;
  v_input_standard numeric := 0;
  v_input_zero     numeric := 0;
  v_input_exempt   numeric := 0;
  v_net_payable    numeric := 0;
BEGIN
  v_date_from := make_date(v_year, v_month, 1);
  v_date_to   := (v_date_from + interval '1 month - 1 day')::date;

  SELECT
    COALESCE(SUM(tax), 0),
    COALESCE(SUM(subtotal), 0)
  INTO v_output_vat, v_taxable_sales
  FROM sales
  WHERE status NOT IN ('draft', 'cancelled', 'void')
    AND is_deleted IS NOT TRUE
    AND sale_date::date BETWEEN v_date_from AND v_date_to
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  SELECT
    COALESCE(SUM(CASE WHEN COALESCE(vat_status_snapshot, 'standard') = 'standard'     THEN COALESCE(vat_amount, 0) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN COALESCE(vat_status_snapshot, 'standard') = 'zero_rated'   THEN COALESCE(vat_amount, 0) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN COALESCE(vat_status_snapshot, 'standard') IN ('exempt','outside_scope') THEN COALESCE(vat_amount, 0) ELSE 0 END), 0)
  INTO v_input_standard, v_input_zero, v_input_exempt
  FROM purchases
  WHERE is_deleted IS NOT TRUE
    AND purchase_date BETWEEN v_date_from AND v_date_to
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  v_net_payable := v_output_vat - v_input_standard;

  RETURN jsonb_build_object(
    'period',             TO_CHAR(v_date_from, 'Month YYYY'),
    'month',              v_month,
    'year',               v_year,
    'date_from',          v_date_from,
    'date_to',            v_date_to,
    'output_vat',         v_output_vat,
    'taxable_sales',      v_taxable_sales,
    'input_vat_standard', v_input_standard,
    'input_vat_zero',     v_input_zero,
    'input_vat_exempt',   v_input_exempt,
    'total_input_vat',    v_input_standard,
    'net_vat_payable',    v_net_payable,
    'is_refund',          (v_net_payable < 0)
  );
END;
$$;
