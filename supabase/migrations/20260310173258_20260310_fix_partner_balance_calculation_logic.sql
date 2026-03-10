/*
  # Fix Partner Balance Calculation Logic
  
  ## Problem
  The current balance formula calculates:
  `expected_share - paid_expenses - settlements_paid + settlements_received`
  
  This means:
  - Positive = Partner owes money (عليه)
  - Negative = Partner is owed money (له)
  
  But the UI expects:
  - Positive = Partner has credit (له)
  - Negative = Partner owes (عليه)
  
  ## Solution
  Reverse the formula to match UI expectations:
  `paid_expenses - expected_share + settlements_paid - settlements_received`
  
  Now:
  - Positive = Partner paid more than their share (له - has credit)
  - Negative = Partner paid less than their share (عليه - owes)
*/

DROP VIEW IF EXISTS public.v_partner_analytical_balances;

CREATE VIEW public.v_partner_analytical_balances
WITH (security_invoker = true)
AS
WITH operating_shared_expenses AS (
  SELECT COALESCE(SUM(net_amount), 0) AS total
  FROM operating_expenses
  WHERE is_deleted = false AND expense_type != 'capital'
),
setup_shared_expenses AS (
  SELECT COALESCE(SUM(amount), 0) AS total
  FROM setup_expenses
  WHERE category = 'capital'
),
total_shared_expenses AS (
  SELECT (SELECT total FROM operating_shared_expenses) + (SELECT total FROM setup_shared_expenses) AS total
),
operating_partner_expenses AS (
  SELECT 
    pc.partner_id,
    COALESCE(SUM(oe.net_amount), 0) AS paid_expenses
  FROM partner_contributions pc
  JOIN operating_expenses oe ON oe.partner_contribution_id = pc.id
  WHERE pc.is_deleted = false AND oe.is_deleted = false AND oe.expense_type != 'capital'
  GROUP BY pc.partner_id
),
setup_partner_expenses AS (
  SELECT 
    partner_id,
    COALESCE(SUM(amount), 0) AS paid_expenses
  FROM setup_expenses
  WHERE category = 'capital' AND partner_id IS NOT NULL
  GROUP BY partner_id
),
partner_expenses AS (
  SELECT 
    COALESCE(ope.partner_id, spe.partner_id) AS partner_id,
    COALESCE(ope.paid_expenses, 0) + COALESCE(spe.paid_expenses, 0) AS paid_expenses
  FROM operating_partner_expenses ope
  FULL JOIN setup_partner_expenses spe ON spe.partner_id = ope.partner_id
),
settlements_paid AS (
  SELECT 
    from_partner_id AS partner_id,
    COALESCE(SUM(amount), 0) AS total_paid
  FROM partner_settlements
  WHERE is_deleted = false AND status = 'active'
  GROUP BY from_partner_id
),
settlements_received AS (
  SELECT 
    to_partner_id AS partner_id,
    COALESCE(SUM(amount), 0) AS total_received
  FROM partner_settlements
  WHERE is_deleted = false AND status = 'active'
  GROUP BY to_partner_id
)
SELECT 
  p.id AS partner_id,
  p.name,
  p.name_ar,
  p.ownership_percentage,
  p.is_active,
  tse.total AS total_shared_expenses,
  ROUND(tse.total * p.ownership_percentage / 100, 2) AS expected_share,
  COALESCE(pe.paid_expenses, 0) AS paid_expenses,
  COALESCE(sp.total_paid, 0) AS settlements_paid,
  COALESCE(sr.total_received, 0) AS settlements_received,
  -- Reversed formula: paid - expected + settlements_paid - settlements_received
  -- Positive = paid more than share (له - credit)
  -- Negative = paid less than share (عليه - owes)
  ROUND(
    COALESCE(pe.paid_expenses, 0) 
    - (tse.total * p.ownership_percentage / 100)
    + COALESCE(sp.total_paid, 0) 
    - COALESCE(sr.total_received, 0), 
    2
  ) AS current_balance,
  CASE 
    WHEN ROUND(
      COALESCE(pe.paid_expenses, 0) 
      - (tse.total * p.ownership_percentage / 100)
      + COALESCE(sp.total_paid, 0) 
      - COALESCE(sr.total_received, 0), 
      2
    ) > 0 THEN 'له'
    WHEN ROUND(
      COALESCE(pe.paid_expenses, 0) 
      - (tse.total * p.ownership_percentage / 100)
      + COALESCE(sp.total_paid, 0) 
      - COALESCE(sr.total_received, 0), 
      2
    ) < 0 THEN 'عليه'
    ELSE 'متوازن'
  END AS balance_status,
  ABS(ROUND(
    COALESCE(pe.paid_expenses, 0) 
    - (tse.total * p.ownership_percentage / 100)
    + COALESCE(sp.total_paid, 0) 
    - COALESCE(sr.total_received, 0), 
    2
  )) AS balance_absolute
FROM partners p
CROSS JOIN total_shared_expenses tse
LEFT JOIN partner_expenses pe ON pe.partner_id = p.id
LEFT JOIN settlements_paid sp ON sp.partner_id = p.id
LEFT JOIN settlements_received sr ON sr.partner_id = p.id
WHERE p.is_active = true
ORDER BY p.name;
