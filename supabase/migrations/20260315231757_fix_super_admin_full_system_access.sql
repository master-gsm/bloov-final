/*
  # Fix Super Admin Full System Access

  1. Problem
    - super_admin cannot see all users (only admin can)
    - super_admin cannot see all branches (restricted by company_id)
    - super_admin should have unrestricted access to entire system

  2. Changes
    - Fix users table RLS: allow super_admin to SELECT, UPDATE, DELETE all users
    - Fix branches table RLS: allow super_admin to see ALL branches regardless of company
    - Create helper function fn_is_super_admin() for cleaner policies

  3. Security
    - super_admin has full system access (no restrictions)
    - admin has company-level access
    - Other roles have branch-level access
*/

CREATE OR REPLACE FUNCTION fn_is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role = 'super_admin'
  );
$$;

DROP POLICY IF EXISTS "users_select_policy" ON users;
DROP POLICY IF EXISTS "users_update_policy" ON users;
DROP POLICY IF EXISTS "users_delete_policy" ON users;
DROP POLICY IF EXISTS "users_insert_policy" ON users;

CREATE POLICY "users_select_policy" ON users
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR fn_is_super_admin()
    OR (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "users_insert_policy" ON users
  FOR INSERT TO authenticated
  WITH CHECK (
    fn_is_super_admin()
    OR (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "users_update_policy" ON users
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = id
    OR fn_is_super_admin()
    OR (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    auth.uid() = id
    OR fn_is_super_admin()
    OR (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "users_delete_policy" ON users
  FOR DELETE TO authenticated
  USING (
    fn_is_super_admin()
    OR (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "Users can view own company branches" ON branches;
DROP POLICY IF EXISTS "Company admins can insert branches" ON branches;
DROP POLICY IF EXISTS "Company admins can update branches" ON branches;
DROP POLICY IF EXISTS "Company admins can delete branches" ON branches;

CREATE POLICY "branches_select_policy" ON branches
  FOR SELECT TO authenticated
  USING (
    fn_is_super_admin()
    OR company_id IN (SELECT fn_get_user_company_ids())
  );

CREATE POLICY "branches_insert_policy" ON branches
  FOR INSERT TO authenticated
  WITH CHECK (
    fn_is_super_admin()
    OR fn_is_company_admin(company_id)
  );

CREATE POLICY "branches_update_policy" ON branches
  FOR UPDATE TO authenticated
  USING (
    fn_is_super_admin()
    OR fn_is_company_admin(company_id)
  )
  WITH CHECK (
    fn_is_super_admin()
    OR fn_is_company_admin(company_id)
  );

CREATE POLICY "branches_delete_policy" ON branches
  FOR DELETE TO authenticated
  USING (
    fn_is_super_admin()
    OR fn_is_company_admin(company_id)
  );
