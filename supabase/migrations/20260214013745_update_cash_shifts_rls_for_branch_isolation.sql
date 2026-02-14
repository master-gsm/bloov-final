/*
  # Update Cash Shifts RLS Policies for Branch Isolation

  ## Overview
  Updates RLS policies for cash_shifts table to enforce branch isolation:
  - Each branch can ONLY see and modify their own cash shifts
  - Super admins can access all branches
  - No cross-branch shift visibility

  ## Changes
  1. Drop existing cash_shifts policies (if any)
  2. Create new policies with strict branch_id filtering
*/

-- ============================================================================
-- 1. DROP EXISTING CASH_SHIFTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view cash shifts" ON cash_shifts;
DROP POLICY IF EXISTS "Users can insert cash shifts" ON cash_shifts;
DROP POLICY IF EXISTS "Users can update cash shifts" ON cash_shifts;
DROP POLICY IF EXISTS "Users can delete cash shifts" ON cash_shifts;

-- ============================================================================
-- 2. CREATE NEW CASH_SHIFTS POLICIES WITH BRANCH ISOLATION
-- ============================================================================

-- Users can view cash shifts from their branch only
CREATE POLICY "Users can view their branch cash shifts"
  ON cash_shifts FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  );

-- Users can insert cash shifts for their branch only
CREATE POLICY "Users can insert cash shifts for their branch"
  ON cash_shifts FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  );

-- Users can update cash shifts in their branch only
CREATE POLICY "Users can update their branch cash shifts"
  ON cash_shifts FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  );

-- Users can delete cash shifts from their branch only
CREATE POLICY "Users can delete their branch cash shifts"
  ON cash_shifts FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  );
