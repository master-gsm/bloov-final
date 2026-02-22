/*
  # Update Financial Summary to 3-Level Profit Structure

  1. Changes
    - Dropped and recreated `get_financial_summary` with new return type
    - Returns 3 profit levels:
      - Gross Profit: total_sales - total_cogs
      - Operating Net: gross_profit - operating_expenses - salaries
      - Accounting Net Profit: operating_net - depreciation
    - Added: operating_net, total_depreciation, total_fixed_assets_cost
    - Setup expenses no longer counted (now via depreciation)

  2. Important Notes
    - net_profit is now the accounting net (includes depreciation)
    - operating_net is the operational performance metric
    - total_setup_expenses kept at 0 for backward compatibility
*/

DROP FUNCTION IF EXISTS public.get_financial_summary(date, date, uuid);

CREATE OR REPLACE FUNCTION public.get_financial_summary(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL
)
RETURNS TABLE (
  total_sales numeric,
  total_tax numeric,
  total_cogs numeric,
  gross_profit numeric,
  total_operating_expenses numeric,
  total_setup_expenses numeric,
  total_employee_salaries numeric,
  net_profit numeric,
  gross_profit_margin_percent numeric,
  net_profit_margin_percent numeric,
  operating_net numeric,
  total_depreciation numeric,
  total_fixed_assets_cost numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH sales_agg AS (
    SELECT
      COALESCE(SUM(s.total), 0) AS total_sales,
      COALESCE(SUM(s.tax), 0) AS total_tax,
      COALESCE(SUM(s.total_cost), 0) AS total_cogs,
      COALESCE(SUM(s.gross_profit), 0) AS gross_profit
    FROM sales s
    WHERE s.status = 'confirmed'
      AND (p_date_from IS NULL OR s.sale_date::date >= p_date_from)
      AND (p_date_to IS NULL OR s.sale_date::date <= p_date_to)
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
  ),
  expenses_agg AS (
    SELECT COALESCE(SUM(e.amount), 0) AS total_operating_expenses
    FROM operating_expenses e
    WHERE e.is_deleted = false
      AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
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
      AND (p_date_to IS NULL OR de.entry_date <= p_date_to)
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
    ea.total_operating_expenses,
    0::numeric AS total_setup_expenses,
    ema.total_employee_salaries,
    sa.gross_profit - ea.total_operating_expenses - ema.total_employee_salaries - da.total_depreciation AS net_profit,
    CASE
      WHEN sa.total_sales > 0
      THEN ROUND((sa.gross_profit / sa.total_sales) * 100, 2)
      ELSE 0
    END AS gross_profit_margin_percent,
    CASE
      WHEN sa.total_sales > 0
      THEN ROUND(((sa.gross_profit - ea.total_operating_expenses - ema.total_employee_salaries - da.total_depreciation) / sa.total_sales) * 100, 2)
      ELSE 0
    END AS net_profit_margin_percent,
    sa.gross_profit - ea.total_operating_expenses - ema.total_employee_salaries AS operating_net,
    da.total_depreciation,
    aa.total_fixed_assets_cost
  FROM sales_agg sa
  CROSS JOIN expenses_agg ea
  CROSS JOIN employees_agg ema
  CROSS JOIN depreciation_agg da
  CROSS JOIN assets_agg aa;
$$;

GRANT EXECUTE ON FUNCTION public.get_financial_summary(date, date, uuid) TO authenticated;
