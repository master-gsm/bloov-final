/*
  # Create partner_financial_summary View
  
  ## Purpose
  Unified view that all partner-related reports, current accounts, and settlements
  should reference. Replaces any scattered balance calculations.
  
  ## Logic
  - total_paid      = SUM(amount) FROM setup_expenses WHERE partner_id = p.id
  - total_expenses  = SUM(amount) FROM setup_expenses (all shared expenses)
  - assumed_share   = ownership_percentage / 100 * total_expenses
  - balance         = total_paid - assumed_share
    (positive = partner has paid MORE than their share → credit toward them)
    (negative = partner has paid LESS than their share → owes the difference)
  
  ## Notes
  - No new tables created
  - No journal entries modified
  - RLS not broken (view uses SECURITY INVOKER)
  - All reports must query this view for partner balances
*/

DROP VIEW IF EXISTS partner_financial_summary CASCADE;

CREATE VIEW partner_financial_summary
WITH (security_invoker = true)
AS
WITH
  all_expenses AS (
    SELECT COALESCE(SUM(amount), 0)::numeric AS total
    FROM setup_expenses
    WHERE is_deleted = false
  ),
  partner_paid AS (
    SELECT
      partner_id,
      COALESCE(SUM(amount), 0)::numeric AS total_paid
    FROM setup_expenses
    WHERE is_deleted = false
      AND partner_id IS NOT NULL
    GROUP BY partner_id
  ),
  settlement_out AS (
    SELECT
      from_partner_id AS partner_id,
      COALESCE(SUM(amount), 0)::numeric AS total_out
    FROM partner_settlements
    WHERE is_deleted = false
      AND status = 'active'
    GROUP BY from_partner_id
  ),
  settlement_in AS (
    SELECT
      to_partner_id AS partner_id,
      COALESCE(SUM(amount), 0)::numeric AS total_in
    FROM partner_settlements
    WHERE is_deleted = false
      AND status = 'active'
    GROUP BY to_partner_id
  )
SELECT
  p.id                                           AS partner_id,
  p.name,
  p.name_ar,
  p.ownership_percentage,
  p.is_active,
  ae.total                                       AS total_expenses,
  COALESCE(pp.total_paid, 0)                     AS total_paid,
  COALESCE(so.total_out, 0)                      AS settlements_paid,
  COALESCE(si.total_in, 0)                       AS settlements_received,
  ROUND((ae.total * p.ownership_percentage / 100), 2) AS assumed_share,
  ROUND(
    COALESCE(pp.total_paid, 0)
    + COALESCE(so.total_out, 0)
    - COALESCE(si.total_in, 0)
    - (ae.total * p.ownership_percentage / 100),
    2
  )                                              AS balance
FROM partners p
CROSS JOIN all_expenses ae
LEFT JOIN partner_paid     pp ON pp.partner_id = p.id
LEFT JOIN settlement_out   so ON so.partner_id = p.id
LEFT JOIN settlement_in    si ON si.partner_id = p.id
WHERE p.is_active = true
ORDER BY p.name;

GRANT SELECT ON partner_financial_summary TO authenticated;

COMMENT ON VIEW partner_financial_summary IS
  'Unified partner financial summary. balance > 0 means partner paid MORE than their share (credit). balance < 0 means partner paid LESS (owes). Source: setup_expenses + partner_settlements.';
