/*
  # Add unit_cost column to inventory_movements

  ## Summary
  Adds a `unit_cost` numeric column to the `inventory_movements` table to store
  the per-unit cost at the time of each inventory movement (sales, purchases, etc.).

  ## Changes
  - `inventory_movements`: new column `unit_cost NUMERIC` (nullable, no default)

  ## Notes
  - Column is nullable to remain backward-compatible with existing rows
  - No logic changes to any functions or triggers
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_movements' AND column_name = 'unit_cost'
  ) THEN
    ALTER TABLE inventory_movements ADD COLUMN unit_cost NUMERIC;
  END IF;
END $$;
