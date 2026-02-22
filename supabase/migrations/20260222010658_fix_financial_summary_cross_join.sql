/*
  # Fix get_financial_summary cross join bug

  1. Problem
    - The function used LEFT JOINs between unrelated tables (sales, operating_expenses, setup_expenses, employees)
    - This caused a cartesian product (cross join), multiplying all values incorrectly
    - Example: 3 sales x 4 employees = 12 rows, inflating all sums
    - Net profit showed -3M instead of the correct value

  2. Solution
    - Use separate subqueries for each table instead of JOINs
    - Each metric is calculated independently to avoid cross multiplication
    - Results are accurate and match the actual data

  3. Changes
    - Recreated get_financial_summary function with subquery approach
*/

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
  net_profit_margin_percent numeric
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
  setup_agg AS (
    SELECT COALESCE(SUM(se.amount), 0) AS total_setup_expenses
    FROM setup_expenses se
    WHERE se.is_deleted = false
  ),
  employees_agg AS (
    SELECT COALESCE(SUM(emp.basic_salary), 0) AS total_employee_salaries
    FROM employees emp
  )
  SELECT
    sa.total_sales,
    sa.total_tax,
    sa.total_cogs,
    sa.gross_profit,
    ea.total_operating_expenses,
    sea.total_setup_expenses,
    ema.total_employee_salaries,
    sa.gross_profit - (ea.total_operating_expenses + sea.total_setup_expenses + ema.total_employee_salaries) AS net_profit,
    CASE
      WHEN sa.total_sales > 0
      THEN ROUND((sa.gross_profit / sa.total_sales) * 100, 2)
      ELSE 0
    END AS gross_profit_margin_percent,
    CASE
      WHEN sa.total_sales > 0
      THEN ROUND(((sa.gross_profit - ea.total_operating_expenses - sea.total_setup_expenses - ema.total_employee_salaries) / sa.total_sales) * 100, 2)
      ELSE 0
    END AS net_profit_margin_percent
  FROM sales_agg sa
  CROSS JOIN expenses_agg ea
  CROSS JOIN setup_agg sea
  CROSS JOIN employees_agg ema;
$$;
