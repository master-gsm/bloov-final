/*
  # Fix Partner Account View to Include Partner Contributions

  1. Problem
    - The v_partner_account view only calculates capital_contribution from setup_expenses
    - It was missing partner_contributions table which stores additional capital contributions
    - This caused incorrect "Actually Paid" amounts for partners

  2. Solution
    - Drop and recreate the view to include BOTH setup_expenses AND partner_contributions
    - Combined total = setup_expenses + partner_contributions

  3. Impact
    - Sami's capital will now correctly include all contributions
    - All partners will have accurate capital_contribution values
*/

DROP VIEW IF EXISTS v_partner_account;

CREATE VIEW v_partner_account WITH (security_invoker = true) AS
SELECT 
  p.id AS partner_id,
  p.name,
  p.name_ar,
  p.ownership_percentage,
  p.profit_share_percentage,
  (COALESCE(se_totals.total_capital, 0) + COALESCE(pc_totals.total_contributions, 0))::numeric(12,2) AS capital_contribution,
  p.is_active,
  COALESCE(pd.total_distributed, 0)::numeric(12,2) AS total_profit_distributed,
  COALESCE(pw.total_withdrawn, 0)::numeric(12,2) AS total_withdrawals,
  COALESCE(ps_paid.total_paid, 0)::numeric(12,2) AS total_settlements_paid,
  COALESCE(ps_rcvd.total_received, 0)::numeric(12,2) AS total_settlements_received,
  (
    COALESCE(pd.total_distributed, 0) 
    - COALESCE(pw.total_withdrawn, 0) 
    - COALESCE(ps_paid.total_paid, 0) 
    + COALESCE(ps_rcvd.total_received, 0)
  )::numeric(12,2) AS current_account_balance
FROM partners p
LEFT JOIN (
  SELECT partner_id, SUM(amount) AS total_capital
  FROM setup_expenses
  WHERE is_deleted = false AND partner_id IS NOT NULL
  GROUP BY partner_id
) se_totals ON se_totals.partner_id = p.id
LEFT JOIN (
  SELECT partner_id, SUM(amount) AS total_contributions
  FROM partner_contributions
  WHERE is_deleted = false AND partner_id IS NOT NULL
  GROUP BY partner_id
) pc_totals ON pc_totals.partner_id = p.id
LEFT JOIN (
  SELECT partner_id, SUM(amount_distributed) AS total_distributed
  FROM profit_distributions
  WHERE status = 'posted'
  GROUP BY partner_id
) pd ON pd.partner_id = p.id
LEFT JOIN (
  SELECT partner_id, SUM(amount) AS total_withdrawn
  FROM partner_withdrawals
  WHERE is_voided = false
  GROUP BY partner_id
) pw ON pw.partner_id = p.id
LEFT JOIN (
  SELECT from_partner_id AS partner_id, SUM(amount) AS total_paid
  FROM partner_settlements
  WHERE status = 'active'
  GROUP BY from_partner_id
) ps_paid ON ps_paid.partner_id = p.id
LEFT JOIN (
  SELECT to_partner_id AS partner_id, SUM(amount) AS total_received
  FROM partner_settlements
  WHERE status = 'active'
  GROUP BY to_partner_id
) ps_rcvd ON ps_rcvd.partner_id = p.id;
