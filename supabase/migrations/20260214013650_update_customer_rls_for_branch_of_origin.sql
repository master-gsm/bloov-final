/*
  # Update Customer RLS Policies for Branch of Origin with Global Lookup

  ## Overview
  Updates RLS policies for customers table to support:
  - Branch of Origin: Customers are assigned to a branch when created
  - Global Lookup: All users can view all customers (to prevent duplicates)
  - Branch-based Management: Users can manage customers from their branch

  ## Changes
  1. Drop existing customer policies
  2. Create new policies that allow:
     - All users to VIEW all customers (global lookup)
     - Users to CREATE customers (assigned to their branch)
     - Users to UPDATE/DELETE customers from their branch (or super admins all)
*/

-- ============================================================================
-- 1. DROP EXISTING CUSTOMER POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view customers" ON customers;
DROP POLICY IF EXISTS "Users can insert customers" ON customers;
DROP POLICY IF EXISTS "Users can update customers" ON customers;
DROP POLICY IF EXISTS "Users can delete customers" ON customers;
DROP POLICY IF EXISTS "Users can manage customers" ON customers;
DROP POLICY IF EXISTS "Authenticated users can view customers" ON customers;
DROP POLICY IF EXISTS "Authenticated users can manage customers" ON customers;

-- ============================================================================
-- 2. CREATE NEW CUSTOMER POLICIES WITH BRANCH SUPPORT
-- ============================================================================

-- All users can view all customers (global lookup to prevent duplicates)
CREATE POLICY "Users can view all customers"
  ON customers FOR SELECT
  TO authenticated
  USING (true);

-- Users can create customers (will be assigned to their branch)
CREATE POLICY "Users can create customers"
  ON customers FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- Users can update customers from their branch (or super admins can update all)
CREATE POLICY "Users can update customers from their branch"
  ON customers FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
    OR branch_id IS NULL
  )
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  );

-- Users can delete customers from their branch (or super admins can delete all)
CREATE POLICY "Users can delete customers from their branch"
  ON customers FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
    OR branch_id IS NULL
  );
