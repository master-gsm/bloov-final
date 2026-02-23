
/*
  # VAT Engine — Migration 2: Input VAT on Expense Tables

  ## Summary
  Adds ZATCA-compliant input VAT fields to all three expense source tables:
  operating_expenses, setup_expenses, and partner_contributions (reimbursements).

  ## Changes to `operating_expenses`
  - `vat_category`   vat_category_enum  DEFAULT 'standard'
  - `tax_code`       text               DEFAULT 'S'
  - `tax_rate`       numeric            DEFAULT 0
  - `vat_amount`     numeric            DEFAULT 0   (computed by trigger)
  - `net_amount`     numeric            DEFAULT 0   (amount excl. VAT, computed by trigger)

  ## Changes to `setup_expenses`
  Same five columns as operating_expenses.

  ## Changes to `partner_contributions`
  Same five columns — VAT only populated when contribution_type = 'reimbursement'.

  ## New Triggers
  - trg_compute_operating_expense_vat    BEFORE INSERT OR UPDATE
  - trg_compute_setup_expense_vat        BEFORE INSERT OR UPDATE
  - trg_compute_partner_contribution_vat BEFORE INSERT OR UPDATE

  ## Backward Compatibility
  - All existing rows: backfilled via app.bypass_immutable to skip freeze trigger.
  - Freeze triggers watch `amount` only — new VAT columns are unrestricted after backfill.
  - partner_contributions: VAT only computed when contribution_type = 'reimbursement'.
*/

-- ── operating_expenses ────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='operating_expenses' AND column_name='vat_category') THEN
    ALTER TABLE operating_expenses ADD COLUMN vat_category vat_category_enum NOT NULL DEFAULT 'standard';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='operating_expenses' AND column_name='tax_code') THEN
    ALTER TABLE operating_expenses ADD COLUMN tax_code text NOT NULL DEFAULT 'S';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='operating_expenses' AND column_name='tax_rate') THEN
    ALTER TABLE operating_expenses ADD COLUMN tax_rate numeric NOT NULL DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='operating_expenses' AND column_name='vat_amount') THEN
    ALTER TABLE operating_expenses ADD COLUMN vat_amount numeric NOT NULL DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='operating_expenses' AND column_name='net_amount') THEN
    ALTER TABLE operating_expenses ADD COLUMN net_amount numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ── setup_expenses ────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='setup_expenses' AND column_name='vat_category') THEN
    ALTER TABLE setup_expenses ADD COLUMN vat_category vat_category_enum NOT NULL DEFAULT 'standard';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='setup_expenses' AND column_name='tax_code') THEN
    ALTER TABLE setup_expenses ADD COLUMN tax_code text NOT NULL DEFAULT 'S';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='setup_expenses' AND column_name='tax_rate') THEN
    ALTER TABLE setup_expenses ADD COLUMN tax_rate numeric NOT NULL DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='setup_expenses' AND column_name='vat_amount') THEN
    ALTER TABLE setup_expenses ADD COLUMN vat_amount numeric NOT NULL DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='setup_expenses' AND column_name='net_amount') THEN
    ALTER TABLE setup_expenses ADD COLUMN net_amount numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ── partner_contributions ─────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partner_contributions' AND column_name='vat_category') THEN
    ALTER TABLE partner_contributions ADD COLUMN vat_category vat_category_enum NOT NULL DEFAULT 'standard';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partner_contributions' AND column_name='tax_code') THEN
    ALTER TABLE partner_contributions ADD COLUMN tax_code text NOT NULL DEFAULT 'S';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partner_contributions' AND column_name='tax_rate') THEN
    ALTER TABLE partner_contributions ADD COLUMN tax_rate numeric NOT NULL DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partner_contributions' AND column_name='vat_amount') THEN
    ALTER TABLE partner_contributions ADD COLUMN vat_amount numeric NOT NULL DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partner_contributions' AND column_name='net_amount') THEN
    ALTER TABLE partner_contributions ADD COLUMN net_amount numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ── Shared helper: derive (tax_code, tax_rate) from vat_category ──────────────
CREATE OR REPLACE FUNCTION _vat_derive_rate(p_category vat_category_enum)
RETURNS TABLE(o_code text, o_rate numeric)
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE p_category
      WHEN 'standard'      THEN 'S'
      WHEN 'zero_rated'    THEN 'Z'
      WHEN 'exempt'        THEN 'E'
      WHEN 'outside_scope' THEN 'O'
      ELSE 'S'
    END::text,
    CASE p_category
      WHEN 'standard' THEN 15.0::numeric
      ELSE 0.0::numeric
    END::numeric;
END;
$$;

-- ── Trigger function: operating_expenses ─────────────────────────────────────
CREATE OR REPLACE FUNCTION compute_operating_expense_vat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rate numeric; v_code text; v_net numeric; v_vat numeric;
BEGIN
  SELECT o_code, o_rate INTO v_code, v_rate FROM _vat_derive_rate(NEW.vat_category);
  IF v_rate > 0 THEN
    v_net := ROUND(NEW.amount / (1 + v_rate / 100), 2);
    v_vat := ROUND(NEW.amount - v_net, 2);
  ELSE
    v_net := NEW.amount;
    v_vat := 0;
  END IF;
  NEW.tax_code   := v_code;
  NEW.tax_rate   := v_rate;
  NEW.vat_amount := v_vat;
  NEW.net_amount := v_net;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_operating_expense_vat ON operating_expenses;
CREATE TRIGGER trg_compute_operating_expense_vat
  BEFORE INSERT OR UPDATE OF vat_category, amount
  ON operating_expenses FOR EACH ROW
  EXECUTE FUNCTION compute_operating_expense_vat();

-- ── Trigger function: setup_expenses ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION compute_setup_expense_vat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rate numeric; v_code text; v_net numeric; v_vat numeric;
BEGIN
  SELECT o_code, o_rate INTO v_code, v_rate FROM _vat_derive_rate(NEW.vat_category);
  IF v_rate > 0 THEN
    v_net := ROUND(NEW.amount / (1 + v_rate / 100), 2);
    v_vat := ROUND(NEW.amount - v_net, 2);
  ELSE
    v_net := NEW.amount;
    v_vat := 0;
  END IF;
  NEW.tax_code   := v_code;
  NEW.tax_rate   := v_rate;
  NEW.vat_amount := v_vat;
  NEW.net_amount := v_net;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_setup_expense_vat ON setup_expenses;
CREATE TRIGGER trg_compute_setup_expense_vat
  BEFORE INSERT OR UPDATE OF vat_category, amount
  ON setup_expenses FOR EACH ROW
  EXECUTE FUNCTION compute_setup_expense_vat();

-- ── Trigger function: partner_contributions ───────────────────────────────────
CREATE OR REPLACE FUNCTION compute_partner_contribution_vat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rate numeric; v_code text; v_net numeric; v_vat numeric;
BEGIN
  IF COALESCE(NEW.contribution_type,'') != 'reimbursement' THEN
    NEW.tax_code   := 'O';
    NEW.tax_rate   := 0;
    NEW.vat_amount := 0;
    NEW.net_amount := NEW.amount;
    RETURN NEW;
  END IF;
  SELECT o_code, o_rate INTO v_code, v_rate FROM _vat_derive_rate(NEW.vat_category);
  IF v_rate > 0 THEN
    v_net := ROUND(NEW.amount / (1 + v_rate / 100), 2);
    v_vat := ROUND(NEW.amount - v_net, 2);
  ELSE
    v_net := NEW.amount;
    v_vat := 0;
  END IF;
  NEW.tax_code   := v_code;
  NEW.tax_rate   := v_rate;
  NEW.vat_amount := v_vat;
  NEW.net_amount := v_net;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_partner_contribution_vat ON partner_contributions;
CREATE TRIGGER trg_compute_partner_contribution_vat
  BEFORE INSERT OR UPDATE OF vat_category, amount, contribution_type
  ON partner_contributions FOR EACH ROW
  EXECUTE FUNCTION compute_partner_contribution_vat();

-- ── Back-fill existing rows using bypass_immutable ────────────────────────────
DO $$
BEGIN
  PERFORM set_config('app.bypass_immutable', 'true', true);

  UPDATE operating_expenses
  SET net_amount = amount, vat_amount = 0, tax_rate = 0, tax_code = 'S'
  WHERE net_amount = 0;

  UPDATE setup_expenses
  SET net_amount = amount, vat_amount = 0, tax_rate = 0, tax_code = 'S'
  WHERE net_amount = 0;

  UPDATE partner_contributions
  SET net_amount = amount, vat_amount = 0, tax_rate = 0, tax_code = 'O'
  WHERE net_amount = 0;

  PERFORM set_config('app.bypass_immutable', 'false', true);
END;
$$;
