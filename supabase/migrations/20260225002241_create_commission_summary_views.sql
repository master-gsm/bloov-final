/*
  # Commission Summary Views

  1. New Views
    - `v_commission_summary` - Per-employee commission totals (total, paid, pending)
    - `v_commission_monthly` - Monthly commission breakdown per employee
  
  2. Security
    - Views use SECURITY INVOKER to respect RLS
*/

CREATE OR REPLACE VIEW public.v_commission_summary
WITH (security_invoker = true)
AS
SELECT
  ec.employee_id,
  e.full_name,
  e.position,
  e.branch_id,
  COUNT(*) FILTER (WHERE ec.status NOT IN ('void')) AS total_transactions,
  COALESCE(SUM(ec.commission_amount) FILTER (WHERE ec.status NOT IN ('void')), 0) AS total_commission,
  COALESCE(SUM(ec.commission_amount) FILTER (WHERE ec.is_paid = true AND ec.status NOT IN ('void')), 0) AS paid_commission,
  COALESCE(SUM(ec.commission_amount) FILTER (WHERE (ec.is_paid IS NULL OR ec.is_paid = false) AND ec.status NOT IN ('void')), 0) AS pending_commission
FROM employee_commissions ec
JOIN employees e ON e.id = ec.employee_id
GROUP BY ec.employee_id, e.full_name, e.position, e.branch_id;

CREATE OR REPLACE VIEW public.v_commission_monthly
WITH (security_invoker = true)
AS
SELECT
  ec.employee_id,
  e.full_name,
  COALESCE(ec.period_year, EXTRACT(YEAR FROM ec.created_at)::int) AS year,
  COALESCE(ec.period_month, EXTRACT(MONTH FROM ec.created_at)::int) AS month,
  COUNT(*) FILTER (WHERE ec.status NOT IN ('void')) AS transaction_count,
  COALESCE(SUM(ec.commission_amount) FILTER (WHERE ec.status NOT IN ('void')), 0) AS total_amount,
  COALESCE(SUM(ec.commission_amount) FILTER (WHERE ec.is_paid = true AND ec.status NOT IN ('void')), 0) AS paid_amount,
  COALESCE(SUM(ec.commission_amount) FILTER (WHERE (ec.is_paid IS NULL OR ec.is_paid = false) AND ec.status NOT IN ('void')), 0) AS pending_amount
FROM employee_commissions ec
JOIN employees e ON e.id = ec.employee_id
GROUP BY ec.employee_id, e.full_name, 
  COALESCE(ec.period_year, EXTRACT(YEAR FROM ec.created_at)::int),
  COALESCE(ec.period_month, EXTRACT(MONTH FROM ec.created_at)::int);
