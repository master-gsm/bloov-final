/*
  # Add 'external' to Sales Source Constraint

  ## Problem
  - 'external' sales option restored in UI
  - But database constraint only allows 'store' and 'salla'
  - Causes: "violates check constraint sales_source_check"

  ## Solution
  - Update constraint to include 'external'
  - Now supports all 3 sources

  ## Changes
  1. Drop existing constraint
  2. Add new constraint with all 3 values
*/

DO $$
BEGIN
  -- Drop existing constraint if it exists
  ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_source_check;
  
  -- Add new constraint with 'external' included
  ALTER TABLE sales ADD CONSTRAINT sales_source_check 
    CHECK (source IN ('store', 'salla', 'external'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;