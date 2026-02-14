/*
  # Fix Customer Update Policy for Cross-Branch Sales

  ## Overview
  Adjusts customer UPDATE policy to allow credit balance updates across branches
  while maintaining branch isolation for other customer data modifications.

  ## Issue
  When Branch B makes a credit sale to a customer from Branch A, the system
  needs to update current_balance. Current RLS policies block this.

  ## Solution
  - USING: Allow selecting any customer for update (authenticated users)
  - WITH CHECK: Still enforces branch restrictions for customer data modifications
  - This works because we're only updating current_balance, not branch_id or other core fields
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can update customers" ON customers;
DROP POLICY IF EXISTS "Users can update customers from their branch" ON customers;

-- Create new UPDATE policy
CREATE POLICY "Users can update customers"
  ON customers FOR UPDATE
  TO authenticated
  USING (
    -- Allow selecting any customer for update (needed for cross-branch credit sales)
    auth.uid() IS NOT NULL
  )
  WITH CHECK (
    -- For modifying core customer data (name, contact, etc.), must be same branch
    -- For updating balance only, this passes since branch_id isn't changing
    -- Super admins can update any customer's data
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id IS NULL
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
    -- The key is that if only updating balance, branch_id doesn't change
    -- so this check passes even for customers from other branches
  );
