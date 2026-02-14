/*
  # Allow Accountant to Delete Sales

  ## Overview
  Update the DELETE policy on sales table to allow accountants to delete sales
  from their branch, in addition to admins and super_admins.

  ## Changes
  - Drop existing DELETE policy
  - Create new DELETE policy that includes accountant role

  ## Permissions
  - ✅ Super Admin: Can delete all sales
  - ✅ Admin: Can delete sales from their branch
  - ✅ Accountant: Can delete sales from their branch
  - ❌ Others: Cannot delete sales

  ## Security
  - Users can only delete sales from their own branch
  - Super Admin can delete from any branch
*/

-- Drop the existing policy
DROP POLICY IF EXISTS "Users can delete sales from their branch" ON sales;

-- Create new policy that includes accountants
CREATE POLICY "Admins and accountants can delete sales from their branch"
  ON sales
  FOR DELETE
  TO authenticated
  USING (
    is_super_admin() 
    OR (
      (
        SELECT role FROM users WHERE id = auth.uid()
      ) IN ('admin', 'accountant')
      AND (branch_id = get_user_branch_id() OR branch_id IS NULL)
    )
  );

-- Also check sale_items DELETE policy
DROP POLICY IF EXISTS "Users can delete sale items" ON sale_items;

CREATE POLICY "Admins and accountants can delete sale items"
  ON sale_items
  FOR DELETE
  TO authenticated
  USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM sales
      WHERE sales.id = sale_items.sale_id
      AND (
        (
          SELECT role FROM users WHERE id = auth.uid()
        ) IN ('admin', 'accountant')
        AND (sales.branch_id = get_user_branch_id() OR sales.branch_id IS NULL)
      )
    )
  );

-- Add helpful comments
COMMENT ON POLICY "Admins and accountants can delete sales from their branch" ON sales IS 
'Allows admins and accountants to delete sales from their own branch. Super admins can delete any sale.';

COMMENT ON POLICY "Admins and accountants can delete sale items" ON sale_items IS 
'Allows admins and accountants to delete sale items for sales they can manage.';
