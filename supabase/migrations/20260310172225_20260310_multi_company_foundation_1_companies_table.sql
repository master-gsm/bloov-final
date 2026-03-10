/*
  # Multi-Company Foundation - Part 1: Companies Table
  
  ## Overview
  This migration creates the core companies table to support multi-tenant SaaS architecture.
  All existing data will be preserved and assigned to a default company.
  
  ## New Tables
  - `companies` - Core company/tenant table with:
    - `id` (uuid, primary key)
    - `name` (text) - Company name
    - `name_ar` (text) - Arabic company name
    - `code` (text, unique) - Short company code for URLs/references
    - `tax_number` (text) - VAT/Tax registration number
    - `commercial_registration` (text) - CR number
    - `address` (text) - Company address
    - `city` (text) - City
    - `country` (text) - Country (default: Saudi Arabia)
    - `phone` (text) - Contact phone
    - `email` (text) - Contact email
    - `logo_url` (text) - Company logo
    - `subscription_plan` (text) - SaaS plan type
    - `subscription_status` (text) - active/suspended/trial
    - `trial_ends_at` (timestamptz) - Trial period end
    - `is_active` (boolean) - Active flag
    - `settings` (jsonb) - Company-specific settings
    - `created_at`, `updated_at` - Timestamps
  
  ## Security
  - RLS enabled with strict company isolation
  - Users can only access their assigned company data
  
  ## Important Notes
  1. A default company will be created for existing data
  2. All existing users will be linked to this default company
  3. This is Phase 1 of the multi-company migration
*/

-- Create companies table
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_ar TEXT,
  code TEXT UNIQUE NOT NULL,
  tax_number TEXT,
  commercial_registration TEXT,
  address TEXT,
  city TEXT,
  country TEXT DEFAULT 'المملكة العربية السعودية',
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  subscription_plan TEXT DEFAULT 'basic' CHECK (subscription_plan IN ('basic', 'professional', 'enterprise')),
  subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('trial', 'active', 'suspended', 'cancelled')),
  trial_ends_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create index on code for quick lookups
CREATE INDEX IF NOT EXISTS idx_companies_code ON public.companies(code);
CREATE INDEX IF NOT EXISTS idx_companies_is_active ON public.companies(is_active);

-- Enable RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Create company_members junction table for user-company relationships
CREATE TABLE IF NOT EXISTS public.company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_role TEXT NOT NULL DEFAULT 'member' CHECK (company_role IN ('owner', 'admin', 'accountant', 'cashier', 'member', 'observer')),
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  joined_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, user_id)
);

-- Indexes for company_members
CREATE INDEX IF NOT EXISTS idx_company_members_company_id ON public.company_members(company_id);
CREATE INDEX IF NOT EXISTS idx_company_members_user_id ON public.company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_company_members_is_primary ON public.company_members(is_primary) WHERE is_primary = true;

-- Enable RLS
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- Create default company for existing data
INSERT INTO public.companies (id, name, name_ar, code, is_active, settings)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Default Company',
  'الشركة الافتراضية',
  'default',
  true,
  '{"is_default": true}'
)
ON CONFLICT (code) DO NOTHING;

-- RLS Policies for companies
CREATE POLICY "Users can view companies they belong to"
  ON public.companies FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT company_id FROM public.company_members 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Company owners can update their company"
  ON public.companies FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT company_id FROM public.company_members 
      WHERE user_id = auth.uid() AND company_role IN ('owner', 'admin') AND is_active = true
    )
  )
  WITH CHECK (
    id IN (
      SELECT company_id FROM public.company_members 
      WHERE user_id = auth.uid() AND company_role IN ('owner', 'admin') AND is_active = true
    )
  );

-- RLS Policies for company_members
CREATE POLICY "Users can view members of their companies"
  ON public.company_members FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Company admins can manage members"
  ON public.company_members FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.company_members 
      WHERE user_id = auth.uid() AND company_role IN ('owner', 'admin') AND is_active = true
    )
  );

CREATE POLICY "Company admins can update members"
  ON public.company_members FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members 
      WHERE user_id = auth.uid() AND company_role IN ('owner', 'admin') AND is_active = true
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.company_members 
      WHERE user_id = auth.uid() AND company_role IN ('owner', 'admin') AND is_active = true
    )
  );

CREATE POLICY "Company admins can remove members"
  ON public.company_members FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members 
      WHERE user_id = auth.uid() AND company_role IN ('owner', 'admin') AND is_active = true
    )
  );

-- Updated at trigger for companies
CREATE OR REPLACE FUNCTION public.update_companies_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_companies_updated_at();

CREATE TRIGGER trg_company_members_updated_at
  BEFORE UPDATE ON public.company_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_companies_updated_at();
