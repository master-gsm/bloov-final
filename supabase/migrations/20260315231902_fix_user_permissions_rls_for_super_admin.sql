/*
  # Fix User Permissions RLS for Super Admin

  1. Problem
    - user_permissions policies only allow 'admin' role
    - super_admin cannot view/manage user permissions

  2. Changes
    - Update all user_permissions policies to include super_admin
    - Use fn_is_super_admin() for cleaner code

  3. Security
    - super_admin can manage all user permissions
    - admin can manage all user permissions
    - Users can only view their own permissions
*/

DROP POLICY IF EXISTS "Users can view own permissions" ON user_permissions;
DROP POLICY IF EXISTS "Admins can view all permissions" ON user_permissions;
DROP POLICY IF EXISTS "Admins can insert permissions" ON user_permissions;
DROP POLICY IF EXISTS "Admins can update permissions" ON user_permissions;
DROP POLICY IF EXISTS "Admins can delete permissions" ON user_permissions;

CREATE POLICY "user_permissions_select_policy" ON user_permissions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR fn_is_super_admin()
    OR (SELECT role FROM users WHERE id = auth.uid() AND is_active = true) = 'admin'
  );

CREATE POLICY "user_permissions_insert_policy" ON user_permissions
  FOR INSERT TO authenticated
  WITH CHECK (
    fn_is_super_admin()
    OR (SELECT role FROM users WHERE id = auth.uid() AND is_active = true) = 'admin'
  );

CREATE POLICY "user_permissions_update_policy" ON user_permissions
  FOR UPDATE TO authenticated
  USING (
    fn_is_super_admin()
    OR (SELECT role FROM users WHERE id = auth.uid() AND is_active = true) = 'admin'
  )
  WITH CHECK (
    fn_is_super_admin()
    OR (SELECT role FROM users WHERE id = auth.uid() AND is_active = true) = 'admin'
  );

CREATE POLICY "user_permissions_delete_policy" ON user_permissions
  FOR DELETE TO authenticated
  USING (
    fn_is_super_admin()
    OR (SELECT role FROM users WHERE id = auth.uid() AND is_active = true) = 'admin'
  );
