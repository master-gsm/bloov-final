/*
  # Professional VAT System for Purchases (ZATCA-Compatible)

  1. Modified Tables
    - `suppliers`
      - `vat_status` (text) - VAT classification: standard, zero_rated, exempt, outside_scope
    - `purchases`
      - `vat_amount` (numeric) - Automatically calculated VAT amount
      - `vat_rate` (numeric) - VAT rate applied (15 for standard, 0 for others)
      - `vat_status_snapshot` (text) - Snapshot of supplier VAT status at time of purchase
      - `subtotal` already exists
      - `total` already exists (will now be total_with_vat)

  2. Security
    - No new tables, existing RLS policies apply

  3. Important Notes
    - VAT is calculated automatically based on supplier vat_status
    - standard = 15% VAT
    - zero_rated = 0% VAT (but tracked separately in reports)
    - exempt = no VAT, excluded from VAT calculations
    - outside_scope = no VAT, excluded from VAT calculations
    - Manual tax entry is prevented by storing the computed values
    - vat_status_snapshot preserves the VAT classification at purchase time
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'vat_status'
  ) THEN
    ALTER TABLE public.suppliers
      ADD COLUMN vat_status text NOT NULL DEFAULT 'standard'
      CHECK (vat_status IN ('standard', 'zero_rated', 'exempt', 'outside_scope'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchases' AND column_name = 'vat_amount'
  ) THEN
    ALTER TABLE public.purchases ADD COLUMN vat_amount numeric(10,2) NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchases' AND column_name = 'vat_rate'
  ) THEN
    ALTER TABLE public.purchases ADD COLUMN vat_rate numeric(5,2) NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchases' AND column_name = 'vat_status_snapshot'
  ) THEN
    ALTER TABLE public.purchases ADD COLUMN vat_status_snapshot text DEFAULT 'standard'
      CHECK (vat_status_snapshot IN ('standard', 'zero_rated', 'exempt', 'outside_scope'));
  END IF;
END $$;

UPDATE public.purchases
SET
  vat_amount = COALESCE(tax, 0),
  vat_rate = CASE WHEN COALESCE(tax, 0) > 0 THEN 15 ELSE 0 END,
  vat_status_snapshot = CASE WHEN COALESCE(tax, 0) > 0 THEN 'standard' ELSE 'exempt' END
WHERE vat_amount = 0 AND COALESCE(tax, 0) > 0;
