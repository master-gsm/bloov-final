/*
  # Add Partner Tracking to Setup Expenses

  1. Changes
    - Add `partner_id` column to `setup_expenses` table to track which partner funded each expense
    - Add foreign key constraint to `partners` table
    - Add index for performance
    - Update RLS policies to include partner-based access

  2. Purpose
    - Links startup expenses to specific partners (Sami or Anas)
    - Enables proper equity/contribution tracking per partner
    - Allows filtering setup expenses by partner in the Partners module
*/

-- Add partner_id column to setup_expenses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'setup_expenses' AND column_name = 'partner_id'
  ) THEN
    ALTER TABLE setup_expenses ADD COLUMN partner_id uuid REFERENCES partners(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_setup_expenses_partner_id ON setup_expenses(partner_id);

-- Update RLS policies to allow viewing setup expenses by partner
DROP POLICY IF EXISTS "Users can view setup expenses" ON setup_expenses;
DROP POLICY IF EXISTS "Users can insert setup expenses" ON setup_expenses;
DROP POLICY IF EXISTS "Users can update setup expenses" ON setup_expenses;
DROP POLICY IF EXISTS "Users can delete setup expenses" ON setup_expenses;

-- Create comprehensive RLS policies
CREATE POLICY "Authenticated users can view setup expenses"
  ON setup_expenses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Accountants and admins can insert setup expenses"
  ON setup_expenses FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'accountant')
    )
  );

CREATE POLICY "Accountants and admins can update setup expenses"
  ON setup_expenses FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'accountant')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'accountant')
    )
  );

CREATE POLICY "Admins can delete setup expenses"
  ON setup_expenses FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );
