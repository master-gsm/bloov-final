/*
  # Fix Setup Expenses Update Policy
  
  1. Changes
    - Drop and recreate update policy with proper permissions
    - Allow admin, accountant, and super_admin to update non-deleted records
    - Simplify the policy condition
*/

DROP POLICY IF EXISTS "Accountants and admins can update setup expenses" ON setup_expenses;

CREATE POLICY "Accountants and admins can update setup expenses"
  ON setup_expenses
  FOR UPDATE
  TO authenticated
  USING (
    is_deleted = false
    AND EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role IN ('admin', 'accountant', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role IN ('admin', 'accountant', 'super_admin')
    )
  );
