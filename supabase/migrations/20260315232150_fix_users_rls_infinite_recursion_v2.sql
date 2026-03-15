/*
  # Fix Users RLS Infinite Recursion

  1. Problem
    - users RLS policies reference users table causing infinite recursion
    - fn_is_super_admin() also queries users table

  2. Solution
    - Create fn_get_my_role() using SECURITY DEFINER to bypass RLS
    - Create fn_is_admin_or_super() using SECURITY DEFINER
    - Update all users policies to use these functions

  3. Security
    - Functions are SECURITY DEFINER with restricted search_path
    - No infinite recursion possible
*/

CREATE OR REPLACE FUNCTION fn_get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(role, 'viewer') 
  FROM users 
  WHERE id = auth.uid() 
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION fn_is_admin_or_super()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'super_admin')
  );
$$;

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
DROP POLICY IF EXISTS "users_insert_policy" ON users;
DROP POLICY IF EXISTS "users_update_policy" ON users;
DROP POLICY IF EXISTS "users_delete_policy" ON users;

CREATE POLICY "users_select_policy" ON users
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR fn_is_admin_or_super()
  );

CREATE POLICY "users_insert_policy" ON users
  FOR INSERT TO authenticated
  WITH CHECK (
    fn_is_admin_or_super()
  );

CREATE POLICY "users_update_policy" ON users
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = id
    OR fn_is_admin_or_super()
  )
  WITH CHECK (
    auth.uid() = id
    OR fn_is_admin_or_super()
  );

CREATE POLICY "users_delete_policy" ON users
  FOR DELETE TO authenticated
  USING (
    fn_is_admin_or_super()
  );
