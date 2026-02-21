/*
  # Add missing columns to employees table

  ## Summary
  The Employees UI references basic_salary and employment_type columns
  that did not exist in the database. This migration adds them safely.

  ## Changes
  - employees: add `basic_salary` numeric DEFAULT 0
  - employees: add `employment_type` text DEFAULT 'full_time'
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'basic_salary'
  ) THEN
    ALTER TABLE employees ADD COLUMN basic_salary numeric DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'employment_type'
  ) THEN
    ALTER TABLE employees ADD COLUMN employment_type text DEFAULT 'full_time';
  END IF;
END $$;
