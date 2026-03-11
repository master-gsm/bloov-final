/*
  # Fix RLS Policies - Wrap auth.<function>() with (select ...)

  1. Security / Performance
    - Replaces auth.uid() with (select auth.uid()) in RLS policies to prevent
      re-evaluation per row (Supabase recommended pattern)
    - Affected tables: custody_settlements, employee_custodies, setup_expenses,
      error_logs, companies, company_members, user_permissions

  2. Important Notes
    - Each policy is dropped and recreated with the optimized version
    - No data changes, only policy definitions
*/

-- custody_settlements: 3 policies
DROP POLICY IF EXISTS "Admins and accountants can insert settlements" ON public.custody_settlements;
CREATE POLICY "Admins and accountants can insert settlements" ON public.custody_settlements
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (select auth.uid())
      AND users.role = ANY (ARRAY['admin','super_admin','accountant'])
    )
  );

DROP POLICY IF EXISTS "Admins and accountants can update settlements" ON public.custody_settlements;
CREATE POLICY "Admins and accountants can update settlements" ON public.custody_settlements
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (select auth.uid())
      AND users.role = ANY (ARRAY['admin','super_admin','accountant'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (select auth.uid())
      AND users.role = ANY (ARRAY['admin','super_admin','accountant'])
    )
  );

DROP POLICY IF EXISTS "Users can view settlements in their branch" ON public.custody_settlements;
CREATE POLICY "Users can view settlements in their branch" ON public.custody_settlements
  FOR SELECT TO authenticated
  USING (
    branch_id IN (
      SELECT users.branch_id FROM users WHERE users.id = (select auth.uid())
      UNION
      SELECT branches.id FROM branches
      WHERE EXISTS (
        SELECT 1 FROM users
        WHERE users.id = (select auth.uid())
        AND users.role = ANY (ARRAY['admin','super_admin'])
      )
    )
  );

-- employee_custodies: 3 policies
DROP POLICY IF EXISTS "Admins and accountants can insert custodies" ON public.employee_custodies;
CREATE POLICY "Admins and accountants can insert custodies" ON public.employee_custodies
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (select auth.uid())
      AND users.role = ANY (ARRAY['admin','super_admin','accountant'])
    )
  );

DROP POLICY IF EXISTS "Admins and accountants can update custodies" ON public.employee_custodies;
CREATE POLICY "Admins and accountants can update custodies" ON public.employee_custodies
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (select auth.uid())
      AND users.role = ANY (ARRAY['admin','super_admin','accountant'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (select auth.uid())
      AND users.role = ANY (ARRAY['admin','super_admin','accountant'])
    )
  );

DROP POLICY IF EXISTS "Users can view custodies in their branch" ON public.employee_custodies;
CREATE POLICY "Users can view custodies in their branch" ON public.employee_custodies
  FOR SELECT TO authenticated
  USING (
    branch_id IN (
      SELECT users.branch_id FROM users WHERE users.id = (select auth.uid())
      UNION
      SELECT branches.id FROM branches
      WHERE EXISTS (
        SELECT 1 FROM users
        WHERE users.id = (select auth.uid())
        AND users.role = ANY (ARRAY['admin','super_admin'])
      )
    )
  );

-- setup_expenses: fix update policy
DROP POLICY IF EXISTS "Accountants and admins can update setup expenses" ON public.setup_expenses;
CREATE POLICY "Accountants and admins can update setup expenses" ON public.setup_expenses
  FOR UPDATE TO authenticated
  USING (
    is_deleted = false
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (select auth.uid())
      AND users.role = ANY (ARRAY['admin','accountant','super_admin'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (select auth.uid())
      AND users.role = ANY (ARRAY['admin','accountant','super_admin'])
    )
  );

-- error_logs: fix select and update policies
DROP POLICY IF EXISTS "error_logs_select_admin" ON public.error_logs;
CREATE POLICY "error_logs_select_admin" ON public.error_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (select auth.uid())
      AND users.role = ANY (ARRAY['admin','super_admin'])
    )
  );

DROP POLICY IF EXISTS "error_logs_update_admin" ON public.error_logs;
CREATE POLICY "error_logs_update_admin" ON public.error_logs
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (select auth.uid())
      AND users.role = ANY (ARRAY['admin','super_admin'])
    )
  );

-- companies: fix select and update policies
DROP POLICY IF EXISTS "Users can view companies they belong to" ON public.companies;
CREATE POLICY "Users can view companies they belong to" ON public.companies
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT company_members.company_id FROM company_members
      WHERE company_members.user_id = (select auth.uid())
      AND company_members.is_active = true
    )
  );

DROP POLICY IF EXISTS "Company owners can update their company" ON public.companies;
CREATE POLICY "Company owners can update their company" ON public.companies
  FOR UPDATE TO authenticated
  USING (
    id IN (
      SELECT company_members.company_id FROM company_members
      WHERE company_members.user_id = (select auth.uid())
      AND company_members.company_role = ANY (ARRAY['owner','admin'])
      AND company_members.is_active = true
    )
  )
  WITH CHECK (
    id IN (
      SELECT company_members.company_id FROM company_members
      WHERE company_members.user_id = (select auth.uid())
      AND company_members.company_role = ANY (ARRAY['owner','admin'])
      AND company_members.is_active = true
    )
  );

-- company_members: fix all 4 policies
DROP POLICY IF EXISTS "Users can view members of their companies" ON public.company_members;
CREATE POLICY "Users can view members of their companies" ON public.company_members
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = (select auth.uid()) AND cm.is_active = true
    )
  );

DROP POLICY IF EXISTS "Company admins can manage members" ON public.company_members;
CREATE POLICY "Company admins can manage members" ON public.company_members
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = (select auth.uid())
      AND cm.company_role = ANY (ARRAY['owner','admin'])
      AND cm.is_active = true
    )
  );

DROP POLICY IF EXISTS "Company admins can update members" ON public.company_members;
CREATE POLICY "Company admins can update members" ON public.company_members
  FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = (select auth.uid())
      AND cm.company_role = ANY (ARRAY['owner','admin'])
      AND cm.is_active = true
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = (select auth.uid())
      AND cm.company_role = ANY (ARRAY['owner','admin'])
      AND cm.is_active = true
    )
  );

DROP POLICY IF EXISTS "Company admins can remove members" ON public.company_members;
CREATE POLICY "Company admins can remove members" ON public.company_members
  FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = (select auth.uid())
      AND cm.company_role = ANY (ARRAY['owner','admin'])
      AND cm.is_active = true
    )
  );

-- user_permissions: fix all 5 policies
DROP POLICY IF EXISTS "Users can view own permissions" ON public.user_permissions;
CREATE POLICY "Users can view own permissions" ON public.user_permissions
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Admins can view all permissions" ON public.user_permissions;
CREATE POLICY "Admins can view all permissions" ON public.user_permissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (select auth.uid())
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

DROP POLICY IF EXISTS "Admins can insert permissions" ON public.user_permissions;
CREATE POLICY "Admins can insert permissions" ON public.user_permissions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (select auth.uid())
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

DROP POLICY IF EXISTS "Admins can update permissions" ON public.user_permissions;
CREATE POLICY "Admins can update permissions" ON public.user_permissions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (select auth.uid())
      AND users.role = 'admin'
      AND users.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (select auth.uid())
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

DROP POLICY IF EXISTS "Admins can delete permissions" ON public.user_permissions;
CREATE POLICY "Admins can delete permissions" ON public.user_permissions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (select auth.uid())
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );
