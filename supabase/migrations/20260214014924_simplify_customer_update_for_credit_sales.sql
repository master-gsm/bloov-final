/*
  # Simplify Customer Update Policy for Cross-Branch Credit Sales

  ## Overview
  Simplifies customer UPDATE policy to allow credit balance updates from any branch.

  ## Business Logic
  - Customers have a "branch of origin" (where they were created)
  - Any branch can sell to any customer (including on credit)
  - When selling on credit, any branch needs to update the customer's current_balance
  - Branch isolation is maintained through sales records, not customer access

  ## Security
  - Users can update customer financial data (current_balance) from any branch
  - More restrictive policies on sales/inventory tables maintain proper branch isolation
  - The critical financial tracking happens in sales table (which has strict branch isolation)

  ## Changes
  - Simplify UPDATE policy to allow authenticated users to update any customer
  - This enables cross-branch credit sales
  - Branch isolation is enforced at the sales/transaction level, not customer level
*/

-- Drop existing UPDATE policy
DROP POLICY IF EXISTS "Users can update customers" ON customers;

-- Create simplified UPDATE policy for cross-branch credit sales
CREATE POLICY "Users can update customers"
  ON customers FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Note: Branch isolation is maintained through:
-- 1. Sales table has strict branch_id RLS (users only see their branch's sales)
-- 2. Customer creation assigns to user's branch (branch of origin)
-- 3. Inventory updates are branch-isolated
-- 4. This policy allows updating customer balance for cross-branch credit sales
