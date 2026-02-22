/*
  # Add sale_source to sales and subtype to expenses

  ## Changes

  ### 1. sales table
  - Add `sale_source` column (text, NOT NULL, default 'store')
  - Allowed values: store, instagram, google, tiktok, salla, whatsapp, other
  - Populate existing rows from the existing `source` column

  ### 2. expenses table
  - Add `subtype` column (text, nullable) for sub-classification
  - Used when category = 'marketing' to track the channel (instagram, google, tiktok, etc.)

  ## Notes
  - sale_source is separate from the existing `source` column to avoid breaking existing logic
  - No data is deleted
*/

-- 1. Add sale_source to sales
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'sale_source'
  ) THEN
    ALTER TABLE sales ADD COLUMN sale_source text NOT NULL DEFAULT 'store';
  END IF;
END $$;

-- Backfill from existing source column
UPDATE sales
SET sale_source = source
WHERE sale_source = 'store' AND source IS NOT NULL AND source <> 'store';

-- Add check constraint for valid values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'sales'::regclass AND conname = 'sales_sale_source_check'
  ) THEN
    ALTER TABLE sales ADD CONSTRAINT sales_sale_source_check
      CHECK (sale_source IN ('store','instagram','google','tiktok','salla','whatsapp','other','external'));
  END IF;
END $$;

-- 2. Add subtype to expenses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'subtype'
  ) THEN
    ALTER TABLE expenses ADD COLUMN subtype text;
  END IF;
END $$;
