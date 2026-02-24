/*
  # Restructure Partners Table for Full Ownership Management

  1. Modified Columns on `partners`
    - `ownership_percentage` (numeric(5,2)) - added, migrated from share_percentage
    - `profit_share_percentage` (numeric(5,2)) - added, migrated from share_percentage
    - `capital_contribution` (numeric(12,2)) - added, default 0

  2. Security
    - Added INSERT policy for admin on `partners`
    - Added UPDATE policy for admin on `partners`
    - Added DELETE policy for admin on `partners`

  3. View Update
    - Recreated `v_partner_balances` to include new columns

  4. Trigger
    - `trg_validate_partner_ownership` validates total ownership <= 100%
    - Auto-syncs share_percentage from ownership_percentage

  5. Notes
    - Existing data preserved: share_percentage values copied to both new columns
    - No data loss
*/

DROP VIEW IF EXISTS v_partner_balances;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partners' AND column_name = 'ownership_percentage'
  ) THEN
    ALTER TABLE partners ADD COLUMN ownership_percentage numeric(5,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partners' AND column_name = 'profit_share_percentage'
  ) THEN
    ALTER TABLE partners ADD COLUMN profit_share_percentage numeric(5,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partners' AND column_name = 'capital_contribution'
  ) THEN
    ALTER TABLE partners ADD COLUMN capital_contribution numeric(12,2) DEFAULT 0;
  END IF;
END $$;

UPDATE partners
SET ownership_percentage = share_percentage,
    profit_share_percentage = share_percentage
WHERE ownership_percentage = 0 OR ownership_percentage IS NULL;

CREATE VIEW v_partner_balances AS
WITH partner_expenses AS (
  SELECT p.id AS partner_id,
    p.name,
    p.name_ar,
    p.ownership_percentage AS share_percentage,
    p.profit_share_percentage,
    p.capital_contribution,
    p.is_active,
    COALESCE(sum(se.amount), 0::numeric) AS total_paid
  FROM partners p
  LEFT JOIN setup_expenses se ON se.partner_id = p.id AND se.is_deleted = false AND se.voided_at IS NULL
  GROUP BY p.id, p.name, p.name_ar, p.ownership_percentage, p.profit_share_percentage, p.capital_contribution, p.is_active
), all_expenses_total AS (
  SELECT COALESCE(sum(amount), 0::numeric) AS total
  FROM setup_expenses
  WHERE is_deleted = false AND voided_at IS NULL
), partner_shares AS (
  SELECT pe.partner_id,
    pe.name,
    pe.name_ar,
    pe.share_percentage,
    pe.profit_share_percentage,
    pe.capital_contribution,
    pe.is_active,
    pe.total_paid,
    ((SELECT total FROM all_expenses_total) * (pe.share_percentage / 100.0)) AS fair_share
  FROM partner_expenses pe
), settlements_paid AS (
  SELECT from_partner_id AS partner_id,
    COALESCE(sum(amount), 0::numeric) AS total_paid_out
  FROM partner_settlements
  WHERE status = 'active' AND is_deleted = false
  GROUP BY from_partner_id
), settlements_received AS (
  SELECT to_partner_id AS partner_id,
    COALESCE(sum(amount), 0::numeric) AS total_received
  FROM partner_settlements
  WHERE status = 'active' AND is_deleted = false
  GROUP BY to_partner_id
)
SELECT ps.partner_id,
  ps.name,
  ps.name_ar,
  ps.share_percentage,
  ps.profit_share_percentage,
  ps.capital_contribution,
  ps.is_active,
  ps.total_paid,
  ps.fair_share,
  COALESCE(sp.total_paid_out, 0::numeric) AS settlements_paid,
  COALESCE(sr.total_received, 0::numeric) AS settlements_received,
  ((ps.total_paid - ps.fair_share) + COALESCE(sp.total_paid_out, 0::numeric) - COALESCE(sr.total_received, 0::numeric)) AS current_balance
FROM partner_shares ps
LEFT JOIN settlements_paid sp ON ps.partner_id = sp.partner_id
LEFT JOIN settlements_received sr ON ps.partner_id = sr.partner_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'Admin can insert partners' AND polrelid = 'public.partners'::regclass
  ) THEN
    CREATE POLICY "Admin can insert partners"
      ON partners FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'Admin can update partners' AND polrelid = 'public.partners'::regclass
  ) THEN
    CREATE POLICY "Admin can update partners"
      ON partners FOR UPDATE
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'Admin can delete partners' AND polrelid = 'public.partners'::regclass
  ) THEN
    CREATE POLICY "Admin can delete partners"
      ON partners FOR DELETE
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.validate_partner_ownership_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
BEGIN
  SELECT COALESCE(SUM(ownership_percentage), 0)
  INTO v_total
  FROM partners
  WHERE id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND is_active = true;

  v_total := v_total + COALESCE(NEW.ownership_percentage, 0);

  IF v_total > 100 THEN
    RAISE EXCEPTION 'Total ownership percentage would be %.2f%% which exceeds 100%%', v_total;
  END IF;

  NEW.share_percentage := NEW.ownership_percentage;
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_partner_ownership ON partners;
CREATE TRIGGER trg_validate_partner_ownership
  BEFORE INSERT OR UPDATE ON partners
  FOR EACH ROW
  EXECUTE FUNCTION validate_partner_ownership_total();
