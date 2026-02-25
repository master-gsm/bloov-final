/*
  # Fix Balance Status Display Logic

  ## Problem
  The balance_status in v_partner_analytical_balances was reversed.
  The current_balance formula is: expected_share - actual_paid
  So when current_balance > 0, the partner has paid LESS than their share → عليه (he owes)
  When current_balance < 0, the partner has paid MORE than their share → له (he is owed)

  ## Fix
  Flip the CASE condition: > 0 → 'عليه', < 0 → 'له'
  No calculations are changed. Only the status label mapping is corrected.
*/

DROP VIEW IF EXISTS public.v_partner_analytical_balances;

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
    ) > 0 THEN 'عليه'
    WHEN round(
      (((tse.total * p.ownership_percentage) / 100::numeric)
        - COALESCE(pe.paid_expenses, 0::numeric)
        - COALESCE(sp.total_paid, 0::numeric)
        + COALESCE(sr.total_received, 0::numeric)),
      2
    ) < 0 THEN 'له'
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

GRANT SELECT ON public.v_partner_analytical_balances TO authenticated;
