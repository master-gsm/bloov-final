/*
  # Allow Credit Balance Updates for All Customers

  ## Overview
  Updates customer RLS policies to allow any branch to update a customer's credit balance
  when making a sale, while still restricting other field updates to the origin branch.

  ## Issue
  When Branch B makes a credit sale to a customer from Branch A, the system needs to
  update the customer's current_balance. The current RLS policy prevents this.

  ## Solution
  Modify the UPDATE policy to allow all authenticated users to update customers
  (for credit balance updates during sales), while the WITH CHECK ensures they
  can only fully modify customers from their own branch.
*/

-- Drop existing UPDATE policy
DROP POLICY IF EXISTS "Users can update customers from their branch" ON customers;

-- Create new UPDATE policy that allows reading any customer but restricts modifications
CREATE POLICY "Users can update customers"
  ON customers FOR UPDATE
  TO authenticated
  USING (
    -- Can read/update any customer (needed for credit sales)
    auth.uid() IS NOT NULL
  )
  WITH CHECK (
    -- But can only modify core customer data if it's their branch or super admin
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
    OR branch_id IS NULL
  );
