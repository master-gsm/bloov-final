/*
  # Fix setup_expenses update policy

  1. Changes
    - Fix the UPDATE policy to include WITH CHECK clause
    - Ensure admins and accountants can update setup expenses properly

  2. Security
    - Maintains role-based access control
    - Only admins, accountants, and super_admins can update
*/

DROP POLICY IF EXISTS "Accountants and admins can update setup expenses" ON setup_expenses;

CREATE POLICY "Accountants and admins can update setup expenses"
  ON setup_expenses
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
    AND is_deleted = false
  )
  WITH CHECK (
    (SELECT auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "soft_delete_filter_update_setup_expenses" ON setup_expenses;
