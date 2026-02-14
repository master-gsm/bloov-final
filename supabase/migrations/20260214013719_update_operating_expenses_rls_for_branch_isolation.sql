/*
  # Update Operating Expenses RLS Policies for Branch Isolation

  ## Overview
  Updates RLS policies for operating_expenses table to enforce branch isolation:
  - Each branch can ONLY see and modify their own expenses
  - Super admins can access all branches
  - No cross-branch expense visibility

  ## Changes
  1. Drop existing operating_expenses policies
  2. Create new policies with strict branch_id filtering
*/

-- ============================================================================
-- 1. DROP EXISTING OPERATING_EXPENSES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view operating expenses" ON operating_expenses;
DROP POLICY IF EXISTS "Users can insert operating expenses" ON operating_expenses;
DROP POLICY IF EXISTS "Users can update operating expenses" ON operating_expenses;
DROP POLICY IF EXISTS "Users can delete operating expenses" ON operating_expenses;
DROP POLICY IF EXISTS "Authenticated users can manage operating expenses" ON operating_expenses;

-- ============================================================================
-- 2. CREATE NEW OPERATING_EXPENSES POLICIES WITH BRANCH ISOLATION
-- ============================================================================

-- Users can view expenses from their branch only
CREATE POLICY "Users can view their branch expenses"
  ON operating_expenses FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  );

-- Users can insert expenses for their branch only
CREATE POLICY "Users can insert expenses for their branch"
  ON operating_expenses FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  );

-- Users can update expenses in their branch only
CREATE POLICY "Users can update their branch expenses"
  ON operating_expenses FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  );

-- Users can delete expenses from their branch only
CREATE POLICY "Users can delete their branch expenses"
  ON operating_expenses FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  );
