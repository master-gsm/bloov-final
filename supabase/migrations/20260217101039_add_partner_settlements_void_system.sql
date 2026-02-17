/*
  # Add Void System to Partner Settlements

  1. Changes
    - Add status column (active/voided) to partner_settlements
    - Add void_reason column
    - Create v_partner_balances view for calculating partner balances
    - Create function to void settlements
    
  2. View: v_partner_balances
    - Calculates total paid by each partner (setup expenses)
    - Calculates settlements between partners
    - Shows current balance for each partner
    - Only includes active (non-voided) records
*/

-- ═══════════════════════════════════════════════════════════
-- Add status and void_reason columns
-- ═══════════════════════════════════════════════════════════

ALTER TABLE partner_settlements 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'voided'));

ALTER TABLE partner_settlements 
ADD COLUMN IF NOT EXISTS void_reason TEXT;

-- Set existing records to active
UPDATE partner_settlements 
SET status = CASE 
  WHEN voided_at IS NOT NULL THEN 'voided'
  ELSE 'active'
END
WHERE status IS NULL OR status = 'active';

-- ═══════════════════════════════════════════════════════════
-- Create v_partner_balances view
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_partner_balances AS
WITH partner_expenses AS (
  -- Setup expenses paid by each partner
  SELECT 
    p.id as partner_id,
    p.name,
    p.name_ar,
    p.share_percentage,
    COALESCE(SUM(se.amount), 0) as total_paid
  FROM partners p
  LEFT JOIN setup_expenses se ON se.partner_id = p.id 
    AND se.is_deleted = false 
    AND se.voided_at IS NULL
  GROUP BY p.id, p.name, p.name_ar, p.share_percentage
),
all_expenses_total AS (
  -- Total of all setup expenses
  SELECT COALESCE(SUM(amount), 0) as total
  FROM setup_expenses
  WHERE is_deleted = false 
    AND voided_at IS NULL
),
partner_shares AS (
  -- Each partner's share based on share percentage
  SELECT 
    pe.partner_id,
    pe.name,
    pe.name_ar,
    pe.share_percentage,
    pe.total_paid,
    (SELECT total FROM all_expenses_total) * (pe.share_percentage / 100.0) as fair_share
  FROM partner_expenses pe
),
settlements_paid AS (
  -- Settlements paid by each partner (outgoing)
  SELECT 
    from_partner_id as partner_id,
    COALESCE(SUM(amount), 0) as total_paid_out
  FROM partner_settlements
  WHERE status = 'active'
    AND is_deleted = false
  GROUP BY from_partner_id
),
settlements_received AS (
  -- Settlements received by each partner (incoming)
  SELECT 
    to_partner_id as partner_id,
    COALESCE(SUM(amount), 0) as total_received
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
  COALESCE(sp.total_paid_out, 0) as settlements_paid,
  COALESCE(sr.total_received, 0) as settlements_received,
  -- Balance = what I paid - my fair share - settlements I paid + settlements I received
  (ps.total_paid - ps.fair_share - COALESCE(sp.total_paid_out, 0) + COALESCE(sr.total_received, 0)) as current_balance
FROM partner_shares ps
LEFT JOIN settlements_paid sp ON ps.partner_id = sp.partner_id
LEFT JOIN settlements_received sr ON ps.partner_id = sr.partner_id;

-- ═══════════════════════════════════════════════════════════
-- Create function to void a settlement
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION void_partner_settlement(
  p_settlement_id UUID,
  p_void_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  UPDATE partner_settlements
  SET 
    status = 'voided',
    voided_at = now(),
    voided_by = v_user_id,
    void_reason = p_void_reason,
    updated_at = now(),
    version = version + 1
  WHERE id = p_settlement_id
    AND status = 'active'
    AND is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement not found or already voided';
  END IF;
END;
$function$;

COMMENT ON FUNCTION void_partner_settlement IS 'Voids a partner settlement (soft delete) with reason';
