/*
  # Add RLS Policies to Tables Without Policies

  1. Security Fixes
    - Add proper RLS policies to tables that have RLS enabled but no policies
    - branch_stock: Add policies for viewing and managing stock
    - partner_contributions: Add policies for managing contributions

  2. Tables Fixed
    - branch_stock
    - partner_contributions
*/

-- Branch stock policies
CREATE POLICY "Users can view branch stock" ON branch_stock
  FOR SELECT
  TO authenticated
  USING (
    branch_id IN (
      SELECT branch_id FROM users WHERE id = (select auth.uid())
    ) OR
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admin and accountant can insert branch stock" ON branch_stock
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

CREATE POLICY "Admin and accountant can update branch stock" ON branch_stock
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

CREATE POLICY "Admin can delete branch stock" ON branch_stock
  FOR DELETE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

-- Partner contributions policies
CREATE POLICY "Admin and accountant can view partner contributions" ON partner_contributions
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'observer', 'super_admin')
    )
  );

CREATE POLICY "Admin and accountant can insert partner contributions" ON partner_contributions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

CREATE POLICY "Admin and accountant can update partner contributions" ON partner_contributions
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

CREATE POLICY "Admin can delete partner contributions" ON partner_contributions
  FOR DELETE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );