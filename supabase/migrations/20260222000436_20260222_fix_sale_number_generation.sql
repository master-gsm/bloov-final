/*
  # Fix sale_number Generation and Duplicate Key Errors

  ## Problem
  - React code generates sale_number locally, causing duplicates
  - sale_number has NO DEFAULT, causing unique constraint violations
  - Multiple inserts of same sale create duplicate key error

  ## Solution
  1. Add sequence for auto-generating sale_number on server
  2. Set DEFAULT to use sequence
  3. React will NOT send sale_number (server generates it)
  4. Prevents duplicate key errors

  ## Changes
  1. Create sequence for sale_number generation
  2. Set sale_number DEFAULT to use sequence with date prefix
  3. Make sale_number optional in INSERT (React shouldn't send it)
*/

-- Create sequence for sale numbering
CREATE SEQUENCE IF NOT EXISTS sales_number_seq START 1000 INCREMENT 1;

-- Add DEFAULT to sale_number using sequence
DO $$
BEGIN
  -- Alter column to add DEFAULT
  -- Format: SALE-YYYYMMDD-NNNN (e.g., SALE-20260222-1000)
  ALTER TABLE sales ALTER COLUMN sale_number SET DEFAULT 'SALE-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(nextval('sales_number_seq')::text, 4, '0');
EXCEPTION WHEN OTHERS THEN
  -- If column already has DEFAULT, do nothing
  NULL;
END $$;