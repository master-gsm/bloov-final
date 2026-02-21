/*
  # Fix Partner Settlements RLS and Balances View

  1. Changes to partner_settlements policies
    - Drop all existing policies (including 2 RESTRICTIVE ones blocking UPDATE)
    - Recreate 4 simple admin-only policies: SELECT, INSERT, UPDATE, DELETE
  2. Changes to v_partner_balances view
    - Rebuild view to filter setup_expenses by voided_at IS NULL (active only)
    - Keep partner_settlements filtered by status = 'active'
    - Correct formula: current_balance = (total_paid - fair_share) + settlements_paid - settlements_received
    - No double counting
*/

-- Drop all existing policies on partner_settlements
DROP POLICY IF EXISTS "Admins can delete partner settlements" ON partner_settlements;
DROP POLICY IF EXISTS "Admins can insert partner settlements" ON partner_settlements;
DROP POLICY IF EXISTS "Admins can view partner settlements" ON partner_settlements;
DROP POLICY IF EXISTS "soft_delete_filter_partner_settlements" ON partner_settlements;
DROP POLICY IF EXISTS "Admins can update partner settlements" ON partner_settlements;
DROP POLICY IF EXISTS "soft_delete_filter_update_partner_settlements" ON partner_settlements;

-- Recreate 4 simple admin-only policies
CREATE POLICY "Admin can select partner settlements"
  ON partner_settlements
  FOR SELECT
  TO authenticated
  USING ( get_my_role() = 'admin' );

CREATE POLICY "Admin can insert partner settlements"
  ON partner_settlements
  FOR INSERT
  TO authenticated
  WITH CHECK ( get_my_role() = 'admin' );

CREATE POLICY "Admin can update partner settlements"
  ON partner_settlements
  FOR UPDATE
  TO authenticated
  USING ( get_my_role() = 'admin' )
  WITH CHECK ( get_my_role() = 'admin' );

CREATE POLICY "Admin can delete partner settlements"
  ON partner_settlements
  FOR DELETE
  TO authenticated
  USING ( get_my_role() = 'admin' );

-- Rebuild v_partner_balances view with clean logic
CREATE OR REPLACE VIEW v_partner_balances AS
WITH partner_expenses AS (
  SELECT
    p.id AS partner_id,
    p.name,
    p.name_ar,
    p.share_percentage,
    COALESCE(SUM(se.amount), 0::numeric) AS total_paid
  FROM partners p
  LEFT JOIN setup_expenses se
    ON se.partner_id = p.id
    AND se.is_deleted = false
    AND se.voided_at IS NULL
  GROUP BY p.id, p.name, p.name_ar, p.share_percentage
),
all_expenses_total AS (
  SELECT COALESCE(SUM(amount), 0::numeric) AS total
  FROM setup_expenses
  WHERE is_deleted = false
    AND voided_at IS NULL
),
partner_shares AS (
  SELECT
    pe.partner_id,
    pe.name,
    pe.name_ar,
    pe.share_percentage,
    pe.total_paid,
    (SELECT total FROM all_expenses_total) * (pe.share_percentage / 100.0) AS fair_share
  FROM partner_expenses pe
),
settlements_paid AS (
  SELECT
    from_partner_id AS partner_id,
    COALESCE(SUM(amount), 0::numeric) AS total_paid_out
  FROM partner_settlements
  WHERE status = 'active'
    AND is_deleted = false
  GROUP BY from_partner_id
),
settlements_received AS (
  SELECT
    to_partner_id AS partner_id,
    COALESCE(SUM(amount), 0::numeric) AS total_received
  FROM partner_settlements
  WHERE status = 'active'
    AND is_deleted = false
  GROUP BY to_partner_id
)
SELECT
  ps.partner_id,
  ps.name,
  ps.name_ar,
  ps.share_percentage,
  ps.total_paid,
  ps.fair_share,
  COALESCE(sp.total_paid_out, 0::numeric)  AS settlements_paid,
  COALESCE(sr.total_received, 0::numeric)  AS settlements_received,
  (
    (ps.total_paid - ps.fair_share)
    + COALESCE(sp.total_paid_out, 0::numeric)
    - COALESCE(sr.total_received, 0::numeric)
  ) AS current_balance
FROM partner_shares ps
LEFT JOIN settlements_paid sp     ON ps.partner_id = sp.partner_id
LEFT JOIN settlements_received sr ON ps.partner_id = sr.partner_id;
