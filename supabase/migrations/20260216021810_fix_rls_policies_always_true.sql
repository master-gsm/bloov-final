/*
  # Fix RLS Policies That Are Always True

  1. Security Issues Fixed
    - Remove policies that allow unrestricted access (USING true or WITH CHECK true)
    - Replace with proper authorization checks
    - These policies effectively bypass RLS security

  2. Tables Fixed
    - ai_insights: Delete and update policies
    - backup_logs, backup_queue: System policies
    - commission_accruals, employee_commissions: System policies
    - loyalty_point_transactions: System policies
    - product_recipes, sale_item_materials: Authenticated user policies
*/

-- AI Insights - Fix delete and update policies
DROP POLICY IF EXISTS "Users can delete insights" ON ai_insights;
CREATE POLICY "Users can delete insights" ON ai_insights
  FOR DELETE
  TO authenticated
  USING (
    created_by = (select auth.uid()) OR
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Users can update insights" ON ai_insights;
CREATE POLICY "Users can update insights" ON ai_insights
  FOR UPDATE
  TO authenticated
  USING (
    created_by = (select auth.uid()) OR
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    created_by = (select auth.uid()) OR
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

-- Backup logs - Restrict to system and admins only
DROP POLICY IF EXISTS "System can insert backup logs" ON backup_logs;
CREATE POLICY "System can insert backup logs" ON backup_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "System can update backup logs" ON backup_logs;
CREATE POLICY "System can update backup logs" ON backup_logs
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

-- Backup queue - Restrict to system and admins only
DROP POLICY IF EXISTS "System can access backup queue" ON backup_queue;
CREATE POLICY "System can access backup queue" ON backup_queue
  FOR ALL
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

-- Commission accruals - Restrict to system and admins only
DROP POLICY IF EXISTS "System can create commissions" ON commission_accruals;
CREATE POLICY "System can create commissions" ON commission_accruals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

-- Loyalty point transactions - Restrict to system and admins only
DROP POLICY IF EXISTS "System can insert loyalty transactions" ON loyalty_point_transactions;
CREATE POLICY "System can insert loyalty transactions" ON loyalty_point_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

-- Product recipes - Restrict to admin and accountant only
DROP POLICY IF EXISTS "Authenticated users can create recipes" ON product_recipes;
CREATE POLICY "Authenticated users can create recipes" ON product_recipes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Authenticated users can update recipes" ON product_recipes;
CREATE POLICY "Authenticated users can update recipes" ON product_recipes
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

DROP POLICY IF EXISTS "Authenticated users can delete recipes" ON product_recipes;
CREATE POLICY "Authenticated users can delete recipes" ON product_recipes
  FOR DELETE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

-- Sale item materials - Restrict to admin and accountant only
DROP POLICY IF EXISTS "Authenticated users can create sale item materials" ON sale_item_materials;
CREATE POLICY "Authenticated users can create sale item materials" ON sale_item_materials
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Authenticated users can update sale item materials" ON sale_item_materials;
CREATE POLICY "Authenticated users can update sale item materials" ON sale_item_materials
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

DROP POLICY IF EXISTS "Authenticated users can delete sale item materials" ON sale_item_materials;
CREATE POLICY "Authenticated users can delete sale item materials" ON sale_item_materials
  FOR DELETE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );