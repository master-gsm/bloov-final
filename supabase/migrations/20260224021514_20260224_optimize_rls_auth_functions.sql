/*
  # Optimize RLS Auth Function Calls

  Convert direct auth.<function>() calls to (SELECT auth.<function>())
  for better performance at scale. This prevents re-evaluation for each row.

  Focus on most critical tables:
  - users, branches, employees, payroll tables
  - purchasing and sales related
  - accounting period locks
*/

-- users table
DROP POLICY IF EXISTS "users_select_policy" ON public.users;
DROP POLICY IF EXISTS "users_update_policy" ON public.users;

CREATE POLICY "users_select_policy"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = id OR
    (SELECT get_user_role()) = 'admin'
  );

CREATE POLICY "users_update_policy"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = id OR
    (SELECT get_user_role()) = 'admin'
  )
  WITH CHECK (
    (SELECT auth.uid()) = id OR
    (SELECT get_user_role()) = 'admin'
  );

-- branches table
DROP POLICY IF EXISTS "admin and observer can view all branches" ON public.branches;
DROP POLICY IF EXISTS "admin can delete branches" ON public.branches;
DROP POLICY IF EXISTS "admin can insert branches" ON public.branches;
DROP POLICY IF EXISTS "admin can update branches" ON public.branches;

CREATE POLICY "admin and observer can view all branches"
  ON public.branches
  FOR SELECT
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'observer')
  );

CREATE POLICY "admin can delete branches"
  ON public.branches
  FOR DELETE
  TO authenticated
  USING (
    (SELECT get_user_role()) = 'admin'
  );

CREATE POLICY "admin can insert branches"
  ON public.branches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT get_user_role()) = 'admin'
  );

CREATE POLICY "admin can update branches"
  ON public.branches
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT get_user_role()) = 'admin'
  )
  WITH CHECK (
    (SELECT get_user_role()) = 'admin'
  );

-- branch_settings table
DROP POLICY IF EXISTS "branch members and admin can view branch_settings" ON public.branch_settings;
DROP POLICY IF EXISTS "super_admin can delete branch_settings" ON public.branch_settings;
DROP POLICY IF EXISTS "super_admin can insert branch_settings" ON public.branch_settings;
DROP POLICY IF EXISTS "super_admin can select branch_settings" ON public.branch_settings;
DROP POLICY IF EXISTS "super_admin can update branch_settings" ON public.branch_settings;

CREATE POLICY "branch members and admin can view branch_settings"
  ON public.branch_settings
  FOR SELECT
  TO authenticated
  USING (
    branch_id = (SELECT get_user_branch_id()) OR
    (SELECT get_user_role()) = 'admin'
  );

CREATE POLICY "super_admin can delete branch_settings"
  ON public.branch_settings
  FOR DELETE
  TO authenticated
  USING (
    (SELECT get_user_role()) = 'admin'
  );

CREATE POLICY "super_admin can insert branch_settings"
  ON public.branch_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT get_user_role()) = 'admin'
  );

CREATE POLICY "super_admin can select branch_settings"
  ON public.branch_settings
  FOR SELECT
  TO authenticated
  USING (
    (SELECT get_user_role()) = 'admin'
  );

CREATE POLICY "super_admin can update branch_settings"
  ON public.branch_settings
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT get_user_role()) = 'admin'
  )
  WITH CHECK (
    (SELECT get_user_role()) = 'admin'
  );

-- depreciation_entries table
DROP POLICY IF EXISTS "Admins and accountants can view depreciation entries" ON public.depreciation_entries;
DROP POLICY IF EXISTS "Admins can delete depreciation entries" ON public.depreciation_entries;
DROP POLICY IF EXISTS "System can insert depreciation entries" ON public.depreciation_entries;

CREATE POLICY "Admins and accountants can view depreciation entries"
  ON public.depreciation_entries
  FOR SELECT
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'accountant')
  );

CREATE POLICY "Admins can delete depreciation entries"
  ON public.depreciation_entries
  FOR DELETE
  TO authenticated
  USING (
    (SELECT get_user_role()) = 'admin'
  );

CREATE POLICY "System can insert depreciation entries"
  ON public.depreciation_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT get_user_role()) IN ('admin', 'accountant')
  );

-- purchase_receipts table
DROP POLICY IF EXISTS "Users can create receipts" ON public.purchase_receipts;
DROP POLICY IF EXISTS "Users can update receipts" ON public.purchase_receipts;
DROP POLICY IF EXISTS "Users can view receipts in their branch" ON public.purchase_receipts;

CREATE POLICY "Users can create receipts"
  ON public.purchase_receipts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT get_user_role()) IN ('admin', 'accountant')
  );

CREATE POLICY "Users can update receipts"
  ON public.purchase_receipts
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'accountant')
  )
  WITH CHECK (
    (SELECT get_user_role()) IN ('admin', 'accountant')
  );

CREATE POLICY "Users can view receipts in their branch"
  ON public.purchase_receipts
  FOR SELECT
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'accountant')
  );
