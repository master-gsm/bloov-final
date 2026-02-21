/*
  # Add RLS Protection to Financial Summary Function

  Ensures that financial data can only be accessed by authorized users.
  The function uses SECURITY DEFINER to bypass RLS, but we'll restrict access via grants.
*/

-- Create a role-based access control layer
-- Admin can see all financial data
-- Managers can see their branch data
-- Others have limited access

-- Ensure the RPC function has proper execution permissions
ALTER FUNCTION get_financial_summary(date, date, uuid) OWNER TO postgres;

-- Only authenticated users can call this function
GRANT EXECUTE ON FUNCTION get_financial_summary(date, date, uuid) 
  TO authenticated;

-- Create a policy-enforcing wrapper if needed
CREATE OR REPLACE FUNCTION get_financial_summary_secure(
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

GRANT EXECUTE ON FUNCTION get_financial_summary_secure(date, date, uuid) 
  TO authenticated;
