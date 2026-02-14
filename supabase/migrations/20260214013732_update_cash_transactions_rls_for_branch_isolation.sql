/*
  # Update Cash Transactions RLS Policies for Branch Isolation

  ## Overview
  Updates RLS policies for cash_transactions table to enforce branch isolation:
  - Each branch can ONLY see and modify their own cash transactions
  - Super admins can access all branches
  - No cross-branch transaction visibility

  ## Changes
  1. Drop existing cash_transactions policies
  2. Create new policies with strict branch_id filtering
*/

-- ============================================================================
-- 1. DROP EXISTING CASH_TRANSACTIONS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view cash transactions" ON cash_transactions;
DROP POLICY IF EXISTS "Users can insert cash transactions" ON cash_transactions;
DROP POLICY IF EXISTS "Users can update cash transactions" ON cash_transactions;
DROP POLICY IF EXISTS "Users can delete cash transactions" ON cash_transactions;

-- ============================================================================
-- 2. CREATE NEW CASH_TRANSACTIONS POLICIES WITH BRANCH ISOLATION
-- ============================================================================

-- Users can view cash transactions from their branch only
CREATE POLICY "Users can view their branch cash transactions"
  ON cash_transactions FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  );

-- Users can insert cash transactions for their branch only
CREATE POLICY "Users can insert cash transactions for their branch"
  ON cash_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  );

-- Users can update cash transactions in their branch only
CREATE POLICY "Users can update their branch cash transactions"
  ON cash_transactions FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  );

-- Users can delete cash transactions from their branch only
CREATE POLICY "Users can delete their branch cash transactions"
  ON cash_transactions FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  );
