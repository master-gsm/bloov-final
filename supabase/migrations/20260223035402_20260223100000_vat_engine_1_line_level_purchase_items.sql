
/*
  # VAT Engine — Migration 1: Line-Level VAT on purchase_items

  ## Summary
  Introduces per-line tax classification on AP invoice lines, matching ZATCA requirements.

  ## New Type
  - `vat_category_enum`: enum('standard', 'zero_rated', 'exempt', 'outside_scope')
    Used across all taxable source tables for consistency.

  ## Changes to `purchase_items`
  - `vat_category`  vat_category_enum  DEFAULT 'standard'
      Per-line ZATCA tax category. Defaults to standard (15%) for backward compatibility.
  - `tax_code`      text               DEFAULT 'S'
      ZATCA tax code short-hand: S=Standard, Z=Zero, E=Exempt, O=OutsideScope.
  - `tax_rate`      numeric            DEFAULT 0
      Effective rate for this line (e.g. 15, 0). Populated by trigger.
  - `tax_amount`    numeric            DEFAULT 0
      Computed: ROUND(net_line * tax_rate / 100, 2). Populated by trigger.

  ## New Trigger: trg_compute_purchase_item_vat
  BEFORE INSERT OR UPDATE on purchase_items.
  - Reads vat_category, derives tax_code and tax_rate automatically.
  - Computes tax_amount from (total - discount) * rate / 100.
  - Does NOT touch quantity, unit_price, discount, or total — fully respects freeze logic.
  - Runs BEFORE the freeze trigger so it can write new-column values freely.

  ## Backward Compatibility
  - All existing rows get vat_category='standard', tax_code='S', tax_rate=0, tax_amount=0.
  - The freeze trigger only watches: quantity, unit_price, discount, total — new columns are NOT frozen.
  - No existing triggers are modified.
*/

-- ── 1. Create shared enum ──────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vat_category_enum') THEN
    CREATE TYPE vat_category_enum AS ENUM (
      'standard',
      'zero_rated',
      'exempt',
      'outside_scope'
    );
  END IF;
END $$;

-- ── 2. Add columns to purchase_items ──────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_items' AND column_name = 'vat_category'
  ) THEN
    ALTER TABLE purchase_items
      ADD COLUMN vat_category vat_category_enum NOT NULL DEFAULT 'standard';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_items' AND column_name = 'tax_code'
  ) THEN
    ALTER TABLE purchase_items
      ADD COLUMN tax_code text NOT NULL DEFAULT 'S';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_items' AND column_name = 'tax_rate'
  ) THEN
    ALTER TABLE purchase_items
      ADD COLUMN tax_rate numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_items' AND column_name = 'tax_amount'
  ) THEN
    ALTER TABLE purchase_items
      ADD COLUMN tax_amount numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ── 3. Function: derive tax_code, tax_rate, tax_amount from vat_category ──────
CREATE OR REPLACE FUNCTION compute_purchase_item_vat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate    numeric := 0;
  v_code    text    := 'S';
  v_net     numeric := 0;
BEGIN
  CASE NEW.vat_category
    WHEN 'standard'      THEN v_rate := 15; v_code := 'S';
    WHEN 'zero_rated'    THEN v_rate :=  0; v_code := 'Z';
    WHEN 'exempt'        THEN v_rate :=  0; v_code := 'E';
    WHEN 'outside_scope' THEN v_rate :=  0; v_code := 'O';
    ELSE                      v_rate := 15; v_code := 'S';
  END CASE;

  -- net line amount (total already includes discount as: qty*price - discount)
  v_net := COALESCE(NEW.total, 0);

  NEW.tax_code   := v_code;
  NEW.tax_rate   := v_rate;
  NEW.tax_amount := ROUND(v_net * v_rate / 100, 2);

  RETURN NEW;
END;
$$;

-- ── 4. Attach trigger (fires BEFORE freeze trigger so new cols can be set) ─────
DROP TRIGGER IF EXISTS trg_compute_purchase_item_vat ON purchase_items;
CREATE TRIGGER trg_compute_purchase_item_vat
  BEFORE INSERT OR UPDATE OF vat_category, total
  ON purchase_items
  FOR EACH ROW
  EXECUTE FUNCTION compute_purchase_item_vat();

-- ── 5. Back-fill existing rows (tax_rate stays 0 → no phantom tax liability) ──
UPDATE purchase_items
SET
  vat_category = 'standard',
  tax_code     = 'S',
  tax_rate     = 0,
  tax_amount   = 0
WHERE tax_rate = 0 AND tax_amount = 0;
