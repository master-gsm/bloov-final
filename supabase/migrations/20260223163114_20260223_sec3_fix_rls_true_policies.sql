
/*
  # Security Fix: Replace USING(true) / WITH CHECK(true) RLS Policies

  ## Summary
  Five tables had RLS policies that allowed unrestricted access to any authenticated user
  via `USING (true)` or `WITH CHECK (true)`. These are replaced with proper branch-scoped
  and role-validated policies.

  ## Tables Fixed

  ### 1. cash_registers
  - Dropped: "Authenticated users can create/delete/update/view cash registers" (all true)
  - Kept as-is: existing branch-scoped policies (cash_registers_select_branch,
    cash_registers_update_branch, cash_registers_insert_branch)
  - Added: new DELETE policy scoped to branch + admin/accountant roles

  ### 2. product_costing
  - Dropped: "System can manage product costing" (ALL, true) and "Users can view product costing" (SELECT, true)
  - Added: SELECT policy (branch isolation, any authenticated user)
  - Added: INSERT/UPDATE/DELETE policies restricted to admin/accountant roles + branch

  ### 3. register_transactions
  - register_transactions has no branch_id; isolation goes through cash_registers
  - Dropped: "Authenticated users can insert/read register transactions" (true)
  - Added: SELECT and INSERT policies that verify the linked register belongs to the user's branch

  ### 4. users
  - Dropped: "users_insert_policy" WITH CHECK (true)
  - Added: INSERT policy restricted to admin and super_admin roles only
    (service_role bypasses RLS, new user signup via auth.signUp() is handled by the
     create-user Edge Function which uses the service role key)

  ### 5. vat_transactions
  - Dropped: "System can insert vat transactions" WITH CHECK (true)
  - Added: INSERT policy allowing only authenticated users whose branch matches
    AND only roles that legitimately create VAT records (admin, accountant, super_admin)
    Note: trigger functions (SECURITY DEFINER) bypass RLS, so this INSERT policy
    applies only to direct inserts from the application layer.

  ## Security Notes
  - RLS remains ENABLED on all five tables.
  - Branch isolation is preserved throughout.
  - super_admin retains cross-branch visibility.
  - SECURITY DEFINER trigger functions are unaffected by these policies.
*/

-- ══════════════════════════════════════════════════════
-- TABLE: cash_registers
-- Drop the four permissive (true) policies
-- ══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Authenticated users can create cash registers" ON public.cash_registers;
DROP POLICY IF EXISTS "Authenticated users can delete cash registers"  ON public.cash_registers;
DROP POLICY IF EXISTS "Authenticated users can update cash registers"  ON public.cash_registers;
DROP POLICY IF EXISTS "Authenticated users can view cash registers"    ON public.cash_registers;

-- Add a proper DELETE policy (the (true) ones allowed any authenticated user to delete)
CREATE POLICY "Admin and accountant can delete own branch cash registers"
  ON public.cash_registers
  FOR DELETE
  TO authenticated
  USING (
    (branch_id = get_user_branch_id() OR get_user_role() = 'super_admin')
    AND get_user_role() = ANY (ARRAY['super_admin','admin','accountant'])
  );

-- ══════════════════════════════════════════════════════
-- TABLE: product_costing
-- Drop both permissive (true) policies
-- ══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "System can manage product costing" ON public.product_costing;
DROP POLICY IF EXISTS "Users can view product costing"   ON public.product_costing;

-- SELECT: any authenticated user for their branch (or super_admin for all)
CREATE POLICY "Users can view product costing for their branch"
  ON public.product_costing
  FOR SELECT
  TO authenticated
  USING (
    branch_id = get_user_branch_id()
    OR get_user_role() = 'super_admin'
  );

-- INSERT: admin and accountant roles, own branch only
CREATE POLICY "Admin and accountant can insert product costing"
  ON public.product_costing
  FOR INSERT
  TO authenticated
  WITH CHECK (
    get_user_role() = ANY (ARRAY['super_admin','admin','accountant'])
    AND (branch_id = get_user_branch_id() OR get_user_role() = 'super_admin')
  );

-- UPDATE: admin and accountant roles, own branch only
CREATE POLICY "Admin and accountant can update product costing"
  ON public.product_costing
  FOR UPDATE
  TO authenticated
  USING (
    get_user_role() = ANY (ARRAY['super_admin','admin','accountant'])
    AND (branch_id = get_user_branch_id() OR get_user_role() = 'super_admin')
  )
  WITH CHECK (
    get_user_role() = ANY (ARRAY['super_admin','admin','accountant'])
    AND (branch_id = get_user_branch_id() OR get_user_role() = 'super_admin')
  );

-- DELETE: super_admin only (product costing records are financial integrity data)
CREATE POLICY "Only super_admin can delete product costing"
  ON public.product_costing
  FOR DELETE
  TO authenticated
  USING (
    get_user_role() = 'super_admin'
  );

-- ══════════════════════════════════════════════════════
-- TABLE: register_transactions
-- No branch_id column — branch isolation via cash_registers join
-- ══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Authenticated users can insert register transactions" ON public.register_transactions;
DROP POLICY IF EXISTS "Authenticated users can read register transactions"   ON public.register_transactions;

-- SELECT: user can only see transactions for registers in their branch
CREATE POLICY "Users can view register transactions for their branch"
  ON public.register_transactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cash_registers cr
      WHERE cr.id = register_transactions.register_id
        AND (
          cr.branch_id = get_user_branch_id()
          OR get_user_role() = 'super_admin'
        )
    )
  );

-- INSERT: cashier, accountant, admin can create transactions for their branch's registers
CREATE POLICY "Cashier and above can insert register transactions for their branch"
  ON public.register_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    get_user_role() = ANY (ARRAY['super_admin','admin','accountant','cashier'])
    AND EXISTS (
      SELECT 1 FROM cash_registers cr
      WHERE cr.id = register_transactions.register_id
        AND (
          cr.branch_id = get_user_branch_id()
          OR get_user_role() = 'super_admin'
        )
    )
  );

-- ══════════════════════════════════════════════════════
-- TABLE: users
-- Drop the permissive INSERT (true) policy
-- ══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "users_insert_policy" ON public.users;

-- INSERT: only admin and super_admin can create user records directly
-- (new user creation flows through the create-user Edge Function using service_role key)
CREATE POLICY "users_insert_policy"
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() = ANY (ARRAY['super_admin','admin'])
  );

-- ══════════════════════════════════════════════════════
-- TABLE: vat_transactions
-- Drop the permissive INSERT (true) policy
-- ══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "System can insert vat transactions" ON public.vat_transactions;

-- INSERT: only admin and accountant roles, scoped to their branch
-- SECURITY DEFINER trigger functions bypass RLS and are unaffected
CREATE POLICY "Admin and accountant can insert vat transactions for their branch"
  ON public.vat_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    get_user_role() = ANY (ARRAY['super_admin','admin','accountant'])
    AND (
      branch_id = get_user_branch_id()
      OR get_user_role() = 'super_admin'
      OR branch_id IS NULL
    )
  );
