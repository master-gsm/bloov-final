/*
  # Update Inventory RLS Policies for Strict Branch Isolation

  ## Overview
  Updates RLS policies for inventory table to enforce strict branch isolation:
  - Each branch can ONLY see and modify their own inventory
  - Super admins can access all branches
  - No cross-branch data access

  ## Changes
  1. Drop existing inventory policies
  2. Create new policies with strict branch_id filtering
*/

-- ============================================================================
-- 1. DROP EXISTING INVENTORY POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view inventory" ON inventory;
DROP POLICY IF EXISTS "Users can insert inventory" ON inventory;
DROP POLICY IF EXISTS "Users can update inventory" ON inventory;
DROP POLICY IF EXISTS "Users can delete inventory" ON inventory;
DROP POLICY IF EXISTS "Authenticated users can view inventory" ON inventory;
DROP POLICY IF EXISTS "Authenticated users can manage inventory" ON inventory;

-- ============================================================================
-- 2. CREATE NEW INVENTORY POLICIES WITH STRICT BRANCH ISOLATION
-- ============================================================================

-- Users can view inventory from their branch only
CREATE POLICY "Users can view their branch inventory"
  ON inventory FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  );

-- Users can insert inventory for their branch only
CREATE POLICY "Users can insert inventory for their branch"
  ON inventory FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  );

-- Users can update inventory in their branch only
CREATE POLICY "Users can update their branch inventory"
  ON inventory FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  );

-- Users can delete inventory from their branch only
CREATE POLICY "Users can delete their branch inventory"
  ON inventory FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  );
