/*
  # Fix RLS Performance Issues and Remove Duplicate Indexes

  1. Remove duplicate vat_transactions index
  2. Update RLS policies to use (SELECT auth.uid()) instead of direct auth.uid()
     for better performance at scale
*/

-- Drop duplicate index on vat_transactions
DROP INDEX IF EXISTS idx_vat_transactions_return_id CASCADE;

-- Keep idx_vat_transactions_vat_return_id which is actually used

-- Fix RLS policies: Replace auth.uid() with (SELECT auth.uid())
-- accounts table
DROP POLICY IF EXISTS "Admins manage accounts" ON public.accounts;

CREATE POLICY "Admins manage accounts"
  ON public.accounts
  FOR ALL
  TO authenticated
  USING (
    (SELECT get_user_role()) = 'admin'
  )
  WITH CHECK (
    (SELECT get_user_role()) = 'admin'
  );

-- journal_lines table
DROP POLICY IF EXISTS "Users manage lines" ON public.journal_lines;
DROP POLICY IF EXISTS "Users view lines" ON public.journal_lines;

CREATE POLICY "Users manage lines"
  ON public.journal_lines
  FOR ALL
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'accountant')
  )
  WITH CHECK (
    (SELECT get_user_role()) IN ('admin', 'accountant')
  );

CREATE POLICY "Users view lines"
  ON public.journal_lines
  FOR SELECT
  TO authenticated
  USING (true);

-- cash_flow_mapping table
DROP POLICY IF EXISTS "Admins can insert cash_flow_mapping" ON public.cash_flow_mapping;
DROP POLICY IF EXISTS "Admins can update cash_flow_mapping" ON public.cash_flow_mapping;

CREATE POLICY "Admins can insert cash_flow_mapping"
  ON public.cash_flow_mapping
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT get_user_role()) = 'admin'
  );

CREATE POLICY "Admins can update cash_flow_mapping"
  ON public.cash_flow_mapping
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT get_user_role()) = 'admin'
  )
  WITH CHECK (
    (SELECT get_user_role()) = 'admin'
  );

-- fixed_assets table
DROP POLICY IF EXISTS "Admins and accountants can view fixed assets" ON public.fixed_assets;
DROP POLICY IF EXISTS "Admins can delete fixed assets" ON public.fixed_assets;
DROP POLICY IF EXISTS "Admins can insert fixed assets" ON public.fixed_assets;
DROP POLICY IF EXISTS "Admins can update fixed assets" ON public.fixed_assets;

CREATE POLICY "Admins and accountants can view fixed assets"
  ON public.fixed_assets
  FOR SELECT
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'accountant')
  );

CREATE POLICY "Admins can delete fixed assets"
  ON public.fixed_assets
  FOR DELETE
  TO authenticated
  USING (
    (SELECT get_user_role()) = 'admin'
  );

CREATE POLICY "Admins can insert fixed assets"
  ON public.fixed_assets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT get_user_role()) = 'admin'
  );

CREATE POLICY "Admins can update fixed assets"
  ON public.fixed_assets
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT get_user_role()) = 'admin'
  )
  WITH CHECK (
    (SELECT get_user_role()) = 'admin'
  );
