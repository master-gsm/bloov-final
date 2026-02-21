/*
  # Simplify Sales RLS -- Admin Only

  1. Changes
    - Drop ALL existing policies on `sales` table (5 policies)
    - Create 3 simple admin-only policies: SELECT, INSERT, UPDATE
  2. Dropped Policies
    - "Admin and accountant can insert sales" (INSERT, permissive)
    - "Users can view sales from their branch" (SELECT, permissive)
    - "soft_delete_filter_sales" (SELECT, restrictive)
    - "Admin and accountant can update sales" (UPDATE, permissive)
    - "soft_delete_filter_update_sales" (UPDATE, restrictive)
  3. New Policies
    - "Admin can select sales" -- admin SELECT
    - "Admin can insert sales" -- admin INSERT
    - "Admin can update sales" -- admin UPDATE
  4. Security
    - All access restricted to authenticated users with admin role
    - No branch filtering, no soft-delete filtering
*/

DROP POLICY IF EXISTS "Admin and accountant can insert sales" ON sales;
DROP POLICY IF EXISTS "Users can view sales from their branch" ON sales;
DROP POLICY IF EXISTS "soft_delete_filter_sales" ON sales;
DROP POLICY IF EXISTS "Admin and accountant can update sales" ON sales;
DROP POLICY IF EXISTS "soft_delete_filter_update_sales" ON sales;

CREATE POLICY "Admin can select sales"
  ON sales
  FOR SELECT
  TO authenticated
  USING ( get_my_role() = 'admin' );

CREATE POLICY "Admin can insert sales"
  ON sales
  FOR INSERT
  TO authenticated
  WITH CHECK ( get_my_role() = 'admin' );

CREATE POLICY "Admin can update sales"
  ON sales
  FOR UPDATE
  TO authenticated
  USING ( get_my_role() = 'admin' )
  WITH CHECK ( get_my_role() = 'admin' );
