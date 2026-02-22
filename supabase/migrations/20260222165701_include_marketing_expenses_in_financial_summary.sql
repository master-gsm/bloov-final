/*
  # Include Marketing Expenses in Financial Summary

  ## Summary
  This migration makes two changes so that marketing expenses
  (expenses.category = 'marketing') are counted in the monthly
  net profit calculation.

  ## Changes

  ### 1. expenses table – valid_category constraint
  - Drop the old constraint that did NOT allow 'marketing'
  - Re-add the constraint with 'marketing' included in the allowed list

  ### 2. get_financial_summary() function
  - Add a new CTE `marketing_expenses_agg` that sums expenses WHERE
    category = 'marketing', filtered by date range and branch_id
  - Add the result to `total_operating_expenses` so it flows through
    to `operating_net` and `net_profit` automatically
  - Backward-compatible: all existing return columns unchanged

  ## Security
  - Function remains SECURITY DEFINER with explicit search_path
  - No RLS changes needed; expenses table already has RLS
*/

-- 1. Allow 'marketing' as a valid category in expenses
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS valid_category;

ALTER TABLE expenses ADD CONSTRAINT valid_category
  CHECK (category IN (
    'rent', 'salaries', 'delivery', 'purchases',
    'utilities', 'maintenance', 'marketing', 'other'
  ));

-- 2. Rebuild get_financial_summary to include marketing expenses
DROP FUNCTION IF EXISTS public.get_financial_summary(date, date, uuid);

CREATE OR REPLACE FUNCTION public.get_financial_summary(
  p_date_from date DEFAULT NULL,
  p_date_to   date DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL
)
RETURNS TABLE (
  total_sales                  numeric,
  total_tax                    numeric,
  total_cogs                   numeric,
  gross_profit                 numeric,
  total_operating_expenses     numeric,
  total_setup_expenses         numeric,
  total_employee_salaries      numeric,
  net_profit                   numeric,
  gross_profit_margin_percent  numeric,
  net_profit_margin_percent    numeric,
  operating_net                numeric,
  total_depreciation           numeric,
  total_fixed_assets_cost      numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH sales_agg AS (
    SELECT
      COALESCE(SUM(s.total), 0)        AS total_sales,
      COALESCE(SUM(s.tax), 0)          AS total_tax,
      COALESCE(SUM(s.total_cost), 0)   AS total_cogs,
      COALESCE(SUM(s.gross_profit), 0) AS gross_profit
    FROM sales s
    WHERE s.status = 'confirmed'
      AND (p_date_from IS NULL OR s.sale_date::date >= p_date_from)
      AND (p_date_to   IS NULL OR s.sale_date::date <= p_date_to)
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
  ),
  expenses_agg AS (
    SELECT COALESCE(SUM(e.amount), 0) AS total_operating_expenses
    FROM operating_expenses e
    WHERE e.is_deleted = false
      AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
      AND (p_date_from IS NULL OR e.expense_date >= p_date_from)
      AND (p_date_to   IS NULL OR e.expense_date <= p_date_to)
  ),
  marketing_agg AS (
    SELECT COALESCE(SUM(e.amount), 0) AS total_marketing_expenses
    FROM expenses e
    WHERE e.is_deleted = false
      AND e.category = 'marketing'
      AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
      AND (p_date_from IS NULL OR e.expense_date >= p_date_from)
      AND (p_date_to   IS NULL OR e.expense_date <= p_date_to)
  ),
  employees_agg AS (
    SELECT COALESCE(SUM(emp.basic_salary), 0) AS total_employee_salaries
    FROM employees emp
  ),
  depreciation_agg AS (
    SELECT COALESCE(SUM(de.amount), 0) AS total_depreciation
    FROM depreciation_entries de
    JOIN fixed_assets fa ON fa.id = de.asset_id
    WHERE fa.is_deleted = false
      AND (p_date_from IS NULL OR de.entry_date >= date_trunc('month', p_date_from)::date)
      AND (p_date_to   IS NULL OR de.entry_date <= p_date_to)
      AND (p_branch_id IS NULL OR fa.branch_id = p_branch_id)
  ),
  assets_agg AS (
    SELECT COALESCE(SUM(fa.purchase_cost), 0) AS total_fixed_assets_cost
    FROM fixed_assets fa
    WHERE fa.is_deleted = false
      AND fa.is_active = true
  )
  SELECT
    sa.total_sales,
    sa.total_tax,
    sa.total_cogs,
    sa.gross_profit,
    -- total_operating_expenses now includes marketing expenses
    ea.total_operating_expenses + ma.total_marketing_expenses          AS total_operating_expenses,
    0::numeric                                                          AS total_setup_expenses,
    ema.total_employee_salaries,
    sa.gross_profit
      - (ea.total_operating_expenses + ma.total_marketing_expenses)
      - ema.total_employee_salaries
      - da.total_depreciation                                           AS net_profit,
    CASE
      WHEN sa.total_sales > 0
      THEN ROUND((sa.gross_profit / sa.total_sales) * 100, 2)
      ELSE 0
    END AS gross_profit_margin_percent,
    CASE
      WHEN sa.total_sales > 0
      THEN ROUND((
        (sa.gross_profit
          - (ea.total_operating_expenses + ma.total_marketing_expenses)
          - ema.total_employee_salaries
          - da.total_depreciation)
        / sa.total_sales) * 100, 2)
      ELSE 0
    END AS net_profit_margin_percent,
    sa.gross_profit
      - (ea.total_operating_expenses + ma.total_marketing_expenses)
      - ema.total_employee_salaries                                     AS operating_net,
    da.total_depreciation,
    aa.total_fixed_assets_cost
  FROM sales_agg sa
  CROSS JOIN expenses_agg ea
  CROSS JOIN marketing_agg ma
  CROSS JOIN employees_agg ema
  CROSS JOIN depreciation_agg da
  CROSS JOIN assets_agg aa;
$$;

GRANT EXECUTE ON FUNCTION public.get_financial_summary(date, date, uuid) TO authenticated;
