/*
  # Remove Duplicate Permissive RLS Policies

  1. Security
    - When multiple permissive policies exist for the same role and action,
      PostgreSQL ORs them together, which can grant broader access than intended
    - For each table, we keep the company-scoped policy (newer, more restrictive)
      and drop the older role-only policy that was superseded

  2. Affected Tables
    - accounting_periods: drop old admin-only policies, keep company-scoped
    - branches: drop old admin-only policies, keep company-scoped
    - categories: drop old "authenticated users" SELECT, keep company-scoped
    - partner_contributions: drop old role-only policies, keep company-scoped
    - partner_settlements: drop old role-only policies, keep company-scoped
    - partners: drop old "authenticated users" SELECT, keep company-scoped
    - products: drop old "authenticated users" SELECT, keep company-scoped
    - settings: drop old role-only SELECT/UPDATE, keep company-scoped
    - suppliers: drop old "authenticated users" SELECT, keep company-scoped
    - user_permissions: both SELECT policies are needed (own vs admin) - no change

  3. Important Notes
    - IF EXISTS used to prevent errors
    - The remaining company-scoped policies are the authoritative access control
*/

-- accounting_periods: drop old role-based duplicates
DROP POLICY IF EXISTS "Admins can view all periods" ON public.accounting_periods;
DROP POLICY IF EXISTS "Admins can manage periods" ON public.accounting_periods;
DROP POLICY IF EXISTS "Admins manage periods update" ON public.accounting_periods;
DROP POLICY IF EXISTS "Admins manage periods delete" ON public.accounting_periods;

-- branches: drop old role-based duplicates
DROP POLICY IF EXISTS "admin and observer can view all branches" ON public.branches;
DROP POLICY IF EXISTS "admin can insert branches" ON public.branches;
DROP POLICY IF EXISTS "admin can update branches" ON public.branches;
DROP POLICY IF EXISTS "admin can delete branches" ON public.branches;

-- categories: drop overly broad "any authenticated" SELECT
DROP POLICY IF EXISTS "Authenticated users can view categories" ON public.categories;

-- partner_contributions: drop old role-based duplicates
DROP POLICY IF EXISTS "Admin and accountant can view partner contributions" ON public.partner_contributions;
DROP POLICY IF EXISTS "Admin and accountant can insert partner contributions" ON public.partner_contributions;
DROP POLICY IF EXISTS "Admin and accountant can update partner contributions" ON public.partner_contributions;
DROP POLICY IF EXISTS "Admin can delete partner contributions" ON public.partner_contributions;

-- partner_settlements: drop old role-based duplicates
DROP POLICY IF EXISTS "Admin can select partner settlements" ON public.partner_settlements;
DROP POLICY IF EXISTS "Admin can insert partner settlements" ON public.partner_settlements;
DROP POLICY IF EXISTS "Admin can update partner settlements" ON public.partner_settlements;
DROP POLICY IF EXISTS "Admin can delete partner settlements" ON public.partner_settlements;

-- partners: drop overly broad "any authenticated" SELECT
DROP POLICY IF EXISTS "Authenticated users can view partners" ON public.partners;

-- products: drop overly broad "any authenticated" SELECT
DROP POLICY IF EXISTS "Authenticated users can view products" ON public.products;

-- settings: drop old role-based duplicates
DROP POLICY IF EXISTS "Admin and accountant can view settings" ON public.settings;
DROP POLICY IF EXISTS "Admin can update settings" ON public.settings;

-- suppliers: drop overly broad "any authenticated" SELECT
DROP POLICY IF EXISTS "Authenticated users can view suppliers" ON public.suppliers;
