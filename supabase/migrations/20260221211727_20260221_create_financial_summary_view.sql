/*
  # Create Centralized Financial Summary View

  ## Purpose
  Single source of truth for all financial calculations in the database.
  All profit, expense, and revenue calculations happen here - NOT in React.

  ## View: v_financial_summary
  Provides:
  - total_sales: Sum of all confirmed sales revenue
  - total_tax: Sum of all sales tax
  - total_cogs: Cost of goods sold calculated from sale items
  - gross_profit: total_sales - total_cogs
  - total_operating_expenses: Sum of operating expenses
  - total_setup_expenses: Sum of setup expenses (not deleted)
  - total_employee_salaries: Sum of all employee basic salaries
  - net_profit: gross_profit - all_expenses

  Supports filtering by:
  - date_from and date_to for sales period
  - branch_id for branch-specific analysis
*/

CREATE OR REPLACE FUNCTION get_financial_summary(
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
SET search_path = 'public'
AS $$
SELECT
  COALESCE(SUM(CASE WHEN s.status = 'confirmed' THEN s.total ELSE 0 END), 0) as total_sales,
  COALESCE(SUM(CASE WHEN s.status = 'confirmed' THEN s.tax ELSE 0 END), 0) as total_tax,
  COALESCE(SUM(CASE WHEN s.status = 'confirmed' THEN s.total_cost ELSE 0 END), 0) as total_cogs,
  COALESCE(SUM(CASE WHEN s.status = 'confirmed' THEN s.gross_profit ELSE 0 END), 0) as gross_profit,
  COALESCE(SUM(CASE WHEN e.is_deleted = false THEN e.amount ELSE 0 END), 0) as total_operating_expenses,
  COALESCE(SUM(CASE WHEN se.is_deleted = false THEN se.amount ELSE 0 END), 0) as total_setup_expenses,
  COALESCE(SUM(emp.basic_salary), 0) as total_employee_salaries,
  COALESCE(SUM(CASE WHEN s.status = 'confirmed' THEN s.gross_profit ELSE 0 END), 0) -
  (
    COALESCE(SUM(CASE WHEN e.is_deleted = false THEN e.amount ELSE 0 END), 0) +
    COALESCE(SUM(CASE WHEN se.is_deleted = false THEN se.amount ELSE 0 END), 0) +
    COALESCE(SUM(emp.basic_salary), 0)
  ) as net_profit,
  CASE 
    WHEN COALESCE(SUM(CASE WHEN s.status = 'confirmed' THEN s.total ELSE 0 END), 0) > 0
    THEN ROUND(
      (COALESCE(SUM(CASE WHEN s.status = 'confirmed' THEN s.gross_profit ELSE 0 END), 0) /
       COALESCE(SUM(CASE WHEN s.status = 'confirmed' THEN s.total ELSE 0 END), 0)) * 100,
      2
    )
    ELSE 0
  END as gross_profit_margin_percent,
  CASE
    WHEN COALESCE(SUM(CASE WHEN s.status = 'confirmed' THEN s.total ELSE 0 END), 0) > 0
    THEN ROUND(
      ((COALESCE(SUM(CASE WHEN s.status = 'confirmed' THEN s.gross_profit ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN e.is_deleted = false THEN e.amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN se.is_deleted = false THEN se.amount ELSE 0 END), 0) -
        COALESCE(SUM(emp.basic_salary), 0)) /
       COALESCE(SUM(CASE WHEN s.status = 'confirmed' THEN s.total ELSE 0 END), 0)) * 100,
      2
    )
    ELSE 0
  END as net_profit_margin_percent
FROM sales s
LEFT JOIN operating_expenses e ON (p_branch_id IS NULL OR e.branch_id = p_branch_id)
LEFT JOIN setup_expenses se ON true
LEFT JOIN employees emp ON true
WHERE s.status = 'confirmed'
  AND (p_date_from IS NULL OR s.sale_date::date >= p_date_from)
  AND (p_date_to IS NULL OR s.sale_date::date <= p_date_to)
  AND (p_branch_id IS NULL OR s.branch_id = p_branch_id);
$$;

GRANT EXECUTE ON FUNCTION get_financial_summary(date, date, uuid) TO authenticated;
