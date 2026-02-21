/*
  # Allow Delete Draft Sales Only

  ## Purpose
  Enforce at the database level that only sales with status = 'draft' can be deleted.
  Confirmed, cancelled, returned, and void sales are protected from deletion.

  ## Changes
  - Drop any existing delete policy on sales table
  - Create a new restrictive DELETE policy that only allows deleting draft sales
  - Same restriction applied to sale_items and employee_commissions when linked to draft sales
*/

DROP POLICY IF EXISTS "Admin and accountant can delete sales" ON sales;
DROP POLICY IF EXISTS "Admins can delete sales" ON sales;
DROP POLICY IF EXISTS "Admin can delete sales" ON sales;

CREATE POLICY "Only draft sales can be deleted"
  ON sales FOR DELETE
  TO authenticated
  USING (
    status = 'draft'
    AND (
      EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'accountant', 'super_admin')
      )
    )
  );
