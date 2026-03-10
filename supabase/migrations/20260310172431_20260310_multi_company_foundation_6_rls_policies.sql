/*
  # Multi-Company Foundation - Part 6: Update RLS Policies
  
  ## Overview
  Update RLS policies to enforce company-level isolation.
  Users can only access data from companies they belong to.
  
  ## Policy Updates
  - branches: Company-scoped access
  - products: Company-scoped access
  - suppliers: Company-scoped access
  - partners: Company-scoped access
  - categories: Company-scoped access
  - settings: Company-scoped access
  - accounting_periods: Company-scoped access
  
  ## Important Notes
  - Existing branch-level policies still apply within company context
  - Company isolation is the first layer, branch isolation is second
*/

-- Drop and recreate branches policies with company scope
DROP POLICY IF EXISTS "Users can view branches" ON public.branches;
DROP POLICY IF EXISTS "Admins can manage branches" ON public.branches;
DROP POLICY IF EXISTS "Users can view own company branches" ON public.branches;

CREATE POLICY "Users can view own company branches"
  ON public.branches FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT fn_get_user_company_ids()));

CREATE POLICY "Company admins can insert branches"
  ON public.branches FOR INSERT
  TO authenticated
  WITH CHECK (fn_is_company_admin(company_id));

CREATE POLICY "Company admins can update branches"
  ON public.branches FOR UPDATE
  TO authenticated
  USING (fn_is_company_admin(company_id))
  WITH CHECK (fn_is_company_admin(company_id));

CREATE POLICY "Company admins can delete branches"
  ON public.branches FOR DELETE
  TO authenticated
  USING (fn_is_company_admin(company_id));

-- Products policies
DROP POLICY IF EXISTS "Users can view products" ON public.products;
DROP POLICY IF EXISTS "Users can view own company products" ON public.products;
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
DROP POLICY IF EXISTS "Admins can insert products" ON public.products;
DROP POLICY IF EXISTS "Admins can update products" ON public.products;
DROP POLICY IF EXISTS "Admins can delete products" ON public.products;

CREATE POLICY "Users can view own company products"
  ON public.products FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT fn_get_user_company_ids()));

CREATE POLICY "Company managers can insert products"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (fn_can_manage_company_data(company_id));

CREATE POLICY "Company managers can update products"
  ON public.products FOR UPDATE
  TO authenticated
  USING (fn_can_manage_company_data(company_id))
  WITH CHECK (fn_can_manage_company_data(company_id));

CREATE POLICY "Company admins can delete products"
  ON public.products FOR DELETE
  TO authenticated
  USING (fn_is_company_admin(company_id));

-- Suppliers policies
DROP POLICY IF EXISTS "Users can view suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Users can view own company suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Admins can manage suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Admins can insert suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Admins can update suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Admins can delete suppliers" ON public.suppliers;

CREATE POLICY "Users can view own company suppliers"
  ON public.suppliers FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT fn_get_user_company_ids()));

CREATE POLICY "Company managers can insert suppliers"
  ON public.suppliers FOR INSERT
  TO authenticated
  WITH CHECK (fn_can_manage_company_data(company_id));

CREATE POLICY "Company managers can update suppliers"
  ON public.suppliers FOR UPDATE
  TO authenticated
  USING (fn_can_manage_company_data(company_id))
  WITH CHECK (fn_can_manage_company_data(company_id));

CREATE POLICY "Company admins can delete suppliers"
  ON public.suppliers FOR DELETE
  TO authenticated
  USING (fn_is_company_admin(company_id));

-- Partners policies
DROP POLICY IF EXISTS "Users can view partners" ON public.partners;
DROP POLICY IF EXISTS "Users can view own company partners" ON public.partners;
DROP POLICY IF EXISTS "Admins can manage partners" ON public.partners;
DROP POLICY IF EXISTS "Admins can insert partners" ON public.partners;
DROP POLICY IF EXISTS "Admins can update partners" ON public.partners;
DROP POLICY IF EXISTS "Admins can delete partners" ON public.partners;

CREATE POLICY "Users can view own company partners"
  ON public.partners FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT fn_get_user_company_ids()));

CREATE POLICY "Company admins can insert partners"
  ON public.partners FOR INSERT
  TO authenticated
  WITH CHECK (fn_is_company_admin(company_id));

CREATE POLICY "Company admins can update partners"
  ON public.partners FOR UPDATE
  TO authenticated
  USING (fn_is_company_admin(company_id))
  WITH CHECK (fn_is_company_admin(company_id));

CREATE POLICY "Company admins can delete partners"
  ON public.partners FOR DELETE
  TO authenticated
  USING (fn_is_company_admin(company_id));

-- Categories policies
DROP POLICY IF EXISTS "Users can view categories" ON public.categories;
DROP POLICY IF EXISTS "Users can view own company categories" ON public.categories;
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;

CREATE POLICY "Users can view own company categories"
  ON public.categories FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT fn_get_user_company_ids()));

CREATE POLICY "Company managers can insert categories"
  ON public.categories FOR INSERT
  TO authenticated
  WITH CHECK (fn_can_manage_company_data(company_id));

CREATE POLICY "Company managers can update categories"
  ON public.categories FOR UPDATE
  TO authenticated
  USING (fn_can_manage_company_data(company_id))
  WITH CHECK (fn_can_manage_company_data(company_id));

CREATE POLICY "Company admins can delete categories"
  ON public.categories FOR DELETE
  TO authenticated
  USING (fn_is_company_admin(company_id));

-- Settings policies
DROP POLICY IF EXISTS "Users can view settings" ON public.settings;
DROP POLICY IF EXISTS "Users can view own company settings" ON public.settings;
DROP POLICY IF EXISTS "Admins can manage settings" ON public.settings;
DROP POLICY IF EXISTS "Admins can insert settings" ON public.settings;
DROP POLICY IF EXISTS "Admins can update settings" ON public.settings;

CREATE POLICY "Users can view own company settings"
  ON public.settings FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT fn_get_user_company_ids()));

CREATE POLICY "Company admins can insert settings"
  ON public.settings FOR INSERT
  TO authenticated
  WITH CHECK (fn_is_company_admin(company_id));

CREATE POLICY "Company admins can update settings"
  ON public.settings FOR UPDATE
  TO authenticated
  USING (fn_is_company_admin(company_id))
  WITH CHECK (fn_is_company_admin(company_id));

-- Accounting periods policies
DROP POLICY IF EXISTS "Users can view accounting_periods" ON public.accounting_periods;
DROP POLICY IF EXISTS "Users can view own company accounting periods" ON public.accounting_periods;
DROP POLICY IF EXISTS "Admins can manage accounting_periods" ON public.accounting_periods;
DROP POLICY IF EXISTS "Admins can insert accounting periods" ON public.accounting_periods;
DROP POLICY IF EXISTS "Admins can update accounting periods" ON public.accounting_periods;
DROP POLICY IF EXISTS "Admins can delete accounting periods" ON public.accounting_periods;

CREATE POLICY "Users can view own company accounting periods"
  ON public.accounting_periods FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT fn_get_user_company_ids()));

CREATE POLICY "Company admins can insert accounting periods"
  ON public.accounting_periods FOR INSERT
  TO authenticated
  WITH CHECK (fn_is_company_admin(company_id));

CREATE POLICY "Company admins can update accounting periods"
  ON public.accounting_periods FOR UPDATE
  TO authenticated
  USING (fn_is_company_admin(company_id))
  WITH CHECK (fn_is_company_admin(company_id));

CREATE POLICY "Company admins can delete accounting periods"
  ON public.accounting_periods FOR DELETE
  TO authenticated
  USING (fn_is_company_admin(company_id));

-- Partner settlements policies
DROP POLICY IF EXISTS "Users can view partner_settlements" ON public.partner_settlements;
DROP POLICY IF EXISTS "Users can view own company partner settlements" ON public.partner_settlements;
DROP POLICY IF EXISTS "Admins can manage partner_settlements" ON public.partner_settlements;
DROP POLICY IF EXISTS "Admins can insert partner settlements" ON public.partner_settlements;
DROP POLICY IF EXISTS "Admins can update partner settlements" ON public.partner_settlements;
DROP POLICY IF EXISTS "Admins can delete partner settlements" ON public.partner_settlements;

CREATE POLICY "Users can view own company partner settlements"
  ON public.partner_settlements FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT fn_get_user_company_ids()));

CREATE POLICY "Company admins can insert partner settlements"
  ON public.partner_settlements FOR INSERT
  TO authenticated
  WITH CHECK (fn_is_company_admin(company_id));

CREATE POLICY "Company admins can update partner settlements"
  ON public.partner_settlements FOR UPDATE
  TO authenticated
  USING (fn_is_company_admin(company_id))
  WITH CHECK (fn_is_company_admin(company_id));

CREATE POLICY "Company admins can delete partner settlements"
  ON public.partner_settlements FOR DELETE
  TO authenticated
  USING (fn_is_company_admin(company_id));

-- Partner contributions policies
DROP POLICY IF EXISTS "Users can view partner_contributions" ON public.partner_contributions;
DROP POLICY IF EXISTS "Users can view own company partner contributions" ON public.partner_contributions;
DROP POLICY IF EXISTS "Admins can manage partner_contributions" ON public.partner_contributions;
DROP POLICY IF EXISTS "Users can insert partner contributions" ON public.partner_contributions;
DROP POLICY IF EXISTS "Admins can update partner contributions" ON public.partner_contributions;
DROP POLICY IF EXISTS "Admins can delete partner contributions" ON public.partner_contributions;

CREATE POLICY "Users can view own company partner contributions"
  ON public.partner_contributions FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT fn_get_user_company_ids()));

CREATE POLICY "Company managers can insert partner contributions"
  ON public.partner_contributions FOR INSERT
  TO authenticated
  WITH CHECK (fn_can_manage_company_data(company_id));

CREATE POLICY "Company managers can update partner contributions"
  ON public.partner_contributions FOR UPDATE
  TO authenticated
  USING (fn_can_manage_company_data(company_id))
  WITH CHECK (fn_can_manage_company_data(company_id));

CREATE POLICY "Company admins can delete partner contributions"
  ON public.partner_contributions FOR DELETE
  TO authenticated
  USING (fn_is_company_admin(company_id));
