/*
  # Fix Accounts Table RLS Policies

  1. Problem
    - Current policy only allows 'admin' role to view/manage accounts
    - Super admin users cannot see the chart of accounts
    - All authenticated users should be able to VIEW accounts (read-only)

  2. Changes
    - Drop restrictive admin-only policy
    - Add SELECT policy for all authenticated users
    - Add separate policies for INSERT/UPDATE/DELETE for admins and super_admins

  3. Security
    - All authenticated users can view accounts (needed for dropdowns in sales, purchases, etc.)
    - Only admin/super_admin can create, edit, or delete accounts
*/

DROP POLICY IF EXISTS "Admins manage accounts" ON accounts;

CREATE POLICY "Authenticated users can view accounts"
  ON accounts
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin and super_admin can insert accounts"
  ON accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'super_admin')
  );

CREATE POLICY "Admin and super_admin can update accounts"
  ON accounts
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'super_admin')
  )
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'super_admin')
  );

CREATE POLICY "Admin and super_admin can delete accounts"
  ON accounts
  FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'super_admin')
  );
