/*
  # Add HR fields to employees table

  1. New Columns on `employees`
    - `iqama_number` (text) - Iqama / Residency permit number
    - `iqama_expiry_date` (date) - Iqama expiry date for alert tracking
    - `passport_number` (text) - Passport number
    - `passport_expiry_date` (date) - Passport expiry date
    - `contract_start_date` (date) - Employment contract start
    - `contract_end_date` (date) - Employment contract end
    - `is_active` (boolean) - Active employment status, default true

  2. Notes
    - All columns added with IF NOT EXISTS guards - no data loss
    - is_active defaults to true for existing records
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'iqama_number') THEN
    ALTER TABLE employees ADD COLUMN iqama_number text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'iqama_expiry_date') THEN
    ALTER TABLE employees ADD COLUMN iqama_expiry_date date;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'passport_number') THEN
    ALTER TABLE employees ADD COLUMN passport_number text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'passport_expiry_date') THEN
    ALTER TABLE employees ADD COLUMN passport_expiry_date date;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'contract_start_date') THEN
    ALTER TABLE employees ADD COLUMN contract_start_date date;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'contract_end_date') THEN
    ALTER TABLE employees ADD COLUMN contract_end_date date;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'is_active') THEN
    ALTER TABLE employees ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_employees_iqama_expiry ON employees (iqama_expiry_date) WHERE iqama_expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_is_active ON employees (is_active);
