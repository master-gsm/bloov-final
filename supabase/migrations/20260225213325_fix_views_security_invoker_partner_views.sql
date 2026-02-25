/*
  # Fix Partner Views: Replace SECURITY DEFINER with SECURITY INVOKER

  ## Problem
  Both views were created with SECURITY DEFINER semantics, which bypasses
  Row Level Security policies. In a financial system this is unacceptable
  because any authenticated user could read all partners' financial data
  regardless of their RLS policies.

  ## Changes
  1. Drop and recreate `v_partner_analytical_balances` as SECURITY INVOKER
  2. Drop and recreate `v_partner_settlements_history` as SECURITY INVOKER

  ## Security Impact
  - Views will now execute with the INVOKER's privileges
  - RLS on the underlying tables (partners, partner_settlements, operating_expenses,
    setup_expenses, partner_contributions, users) will be enforced
  - Branch isolation is preserved because the underlying tables already have
    branch-scoped RLS policies

  ## Note
  SECURITY INVOKER is the PostgreSQL default for views. Explicitly setting it
  ensures future maintainers understand the intent.
*/

-- Drop existing views
DROP VIEW IF EXISTS public.v_partner_analytical_balances;
DROP VIEW IF EXISTS public.v_partner_settlements_history;

-- Recreate v_partner_analytical_balances as SECURITY INVOKER
CREATE VIEW public.v_partner_analytical_balances
  WITH (security_invoker = true)
AS
WITH operating_shared_expenses AS (
  SELECT COALESCE(sum(operating_expenses.net_amount), 0::numeric) AS total
  FROM operating_expenses
  WHERE operating_expenses.is_deleted = false
    AND operating_expenses.expense_type <> 'capital'
),
setup_shared_expenses AS (
  SELECT COALESCE(sum(setup_expenses.amount), 0::numeric) AS total
  FROM setup_expenses
  WHERE setup_expenses.category = 'capital'
),
total_shared_expenses AS (
  SELECT (
    (SELECT operating_shared_expenses.total FROM operating_shared_expenses) +
    (SELECT setup_shared_expenses.total FROM setup_shared_expenses)
  ) AS total
),
operating_partner_expenses AS (
  SELECT pc.partner_id,
    COALESCE(sum(oe.net_amount), 0::numeric) AS paid_expenses
  FROM partner_contributions pc
  JOIN operating_expenses oe ON oe.partner_contribution_id = pc.id
  WHERE pc.is_deleted = false
    AND oe.is_deleted = false
    AND oe.expense_type <> 'capital'
  GROUP BY pc.partner_id
),
setup_partner_expenses AS (
  SELECT setup_expenses.partner_id,
    COALESCE(sum(setup_expenses.amount), 0::numeric) AS paid_expenses
  FROM setup_expenses
  WHERE setup_expenses.category = 'capital'
    AND setup_expenses.partner_id IS NOT NULL
  GROUP BY setup_expenses.partner_id
),
partner_expenses AS (
  SELECT COALESCE(ope.partner_id, spe.partner_id) AS partner_id,
    (COALESCE(ope.paid_expenses, 0::numeric) + COALESCE(spe.paid_expenses, 0::numeric)) AS paid_expenses
  FROM operating_partner_expenses ope
  FULL JOIN setup_partner_expenses spe ON spe.partner_id = ope.partner_id
),
settlements_paid AS (
  SELECT partner_settlements.from_partner_id AS partner_id,
    COALESCE(sum(partner_settlements.amount), 0::numeric) AS total_paid
  FROM partner_settlements
  WHERE partner_settlements.is_deleted = false
    AND partner_settlements.status = 'active'
  GROUP BY partner_settlements.from_partner_id
),
settlements_received AS (
  SELECT partner_settlements.to_partner_id AS partner_id,
    COALESCE(sum(partner_settlements.amount), 0::numeric) AS total_received
  FROM partner_settlements
  WHERE partner_settlements.is_deleted = false
    AND partner_settlements.status = 'active'
  GROUP BY partner_settlements.to_partner_id
)
SELECT
  p.id AS partner_id,
  p.name,
  p.name_ar,
  p.ownership_percentage,
  p.is_active,
  tse.total AS total_shared_expenses,
  round((tse.total * p.ownership_percentage) / 100::numeric, 2) AS expected_share,
  COALESCE(pe.paid_expenses, 0::numeric) AS paid_expenses,
  COALESCE(sp.total_paid, 0::numeric) AS settlements_paid,
  COALESCE(sr.total_received, 0::numeric) AS settlements_received,
  round(
    (((tse.total * p.ownership_percentage) / 100::numeric)
      - COALESCE(pe.paid_expenses, 0::numeric)
      - COALESCE(sp.total_paid, 0::numeric)
      + COALESCE(sr.total_received, 0::numeric)),
    2
  ) AS current_balance,
  CASE
    WHEN round(
      (((tse.total * p.ownership_percentage) / 100::numeric)
        - COALESCE(pe.paid_expenses, 0::numeric)
        - COALESCE(sp.total_paid, 0::numeric)
        + COALESCE(sr.total_received, 0::numeric)),
      2
    ) > 0 THEN 'له'
    WHEN round(
      (((tse.total * p.ownership_percentage) / 100::numeric)
        - COALESCE(pe.paid_expenses, 0::numeric)
        - COALESCE(sp.total_paid, 0::numeric)
        + COALESCE(sr.total_received, 0::numeric)),
      2
    ) < 0 THEN 'عليه'
    ELSE 'متوازن'
  END AS balance_status,
  abs(round(
    (((tse.total * p.ownership_percentage) / 100::numeric)
      - COALESCE(pe.paid_expenses, 0::numeric)
      - COALESCE(sp.total_paid, 0::numeric)
      + COALESCE(sr.total_received, 0::numeric)),
    2
  )) AS balance_absolute
FROM partners p
CROSS JOIN total_shared_expenses tse
LEFT JOIN partner_expenses pe ON pe.partner_id = p.id
LEFT JOIN settlements_paid sp ON sp.partner_id = p.id
LEFT JOIN settlements_received sr ON sr.partner_id = p.id
WHERE p.is_active = true
ORDER BY p.name;

-- Recreate v_partner_settlements_history as SECURITY INVOKER
CREATE VIEW public.v_partner_settlements_history
  WITH (security_invoker = true)
AS
SELECT
  ps.id,
  ps.from_partner_id,
  pf.name AS from_partner_name,
  pf.name_ar AS from_partner_name_ar,
  ps.to_partner_id,
  pt.name AS to_partner_name,
  pt.name_ar AS to_partner_name_ar,
  ps.amount,
  ps.settlement_date,
  ps.description,
  ps.description_ar,
  ps.notes,
  ps.status,
  ps.created_at,
  ps.created_by,
  u.full_name AS created_by_name
FROM partner_settlements ps
JOIN partners pf ON pf.id = ps.from_partner_id
JOIN partners pt ON pt.id = ps.to_partner_id
LEFT JOIN users u ON u.id = ps.created_by
WHERE ps.is_deleted = false
ORDER BY ps.settlement_date DESC, ps.created_at DESC;
